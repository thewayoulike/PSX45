// Daily PSX scan bot — deterministic signals + backtest stats, no LLM.
import { fetchUrlWithFallback, fetchStockHistory } from './psxData';
import { KSE100_SET, KMI30_SET } from './indices';
import {
  computeSignal,
  computeTradePlan,
  computeRsiOversoldPlan,
  backtestRsiOversold,
  mergeRsiOversoldBacktests,
  Verdict,
} from '../utils/indicators';

const STORAGE_KEY = 'psx_daily_scan';
const SETTINGS_KEY = 'psx_scan_bot_settings';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'INDEX', 'KSE'];

export type ScanMode = 'composite' | 'rsi_oversold';
export type ScanUniverse = 'KSE100' | 'KMI30' | 'WATCHLIST';

export interface DailyScanHit {
  symbol: string;
  current: number;
  changePct: number;
  volume: number;
  verdict: Verdict;
  rsi: number;
  score: number;
  stop?: number;
  target?: number;
  backtestWinRate?: number;
  backtestTrades?: number;
  backtestAvgReturnPct?: number;
}

export interface DailyScanSnapshot {
  scannedAt: number;
  universe: ScanUniverse;
  mode: ScanMode;
  hits: DailyScanHit[];
  totalScanned: number;
  aggBacktest?: {
    trades: number;
    winRate: number;
    avgReturnPct: number;
  };
}

export interface ScanBotSettings {
  autoRunIfStale: boolean;
  staleHours: number;
  defaultUniverse: ScanUniverse;
  defaultMode: ScanMode;
}

const DEFAULT_SETTINGS: ScanBotSettings = {
  autoRunIfStale: false,
  staleHours: 24,
  defaultUniverse: 'KSE100',
  defaultMode: 'composite',
};

const numv = (s?: string | null) => {
  const v = parseFloat((s || '').replace(/,/g, '').trim());
  return isNaN(v) ? 0 : v;
};

interface Candidate { symbol: string; current: number; ldcp: number; changePct: number; volume: number; }

const parseCandidates = (html: string): Candidate[] => {
  const out: Candidate[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table').forEach((table) => {
    const trs = table.querySelectorAll('tr');
    if (trs.length < 2) return;
    const col: Record<string, number> = { SYMBOL: 0, LDCP: 1, CURRENT: 5, CHANGE: 6, VOLUME: 7 };
    let found = false;
    trs[0].querySelectorAll('th, td').forEach((cell, i) => {
      const t = (cell.textContent || '').trim().toUpperCase();
      if (t === 'SYMBOL' || t === 'SCRIP') { col.SYMBOL = i; found = true; }
      if (t === 'LDCP' || t === 'PREV') col.LDCP = i;
      if (t === 'CURRENT' || t === 'PRICE' || t === 'RATE') col.CURRENT = i;
      if (t === 'CHANGE' || t === 'NET CHANGE') col.CHANGE = i;
      if (t.includes('VOL')) col.VOLUME = i;
    });
    trs.forEach((tr, r) => {
      if (found && r === 0) return;
      const cols = tr.querySelectorAll('td');
      if (cols.length <= col.CURRENT) return;
      let symbol = cols[col.SYMBOL]?.querySelector('a')?.textContent?.trim().toUpperCase() || '';
      if (!symbol) symbol = (cols[col.SYMBOL]?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase().split(/[\s-]/)[0];
      if (!symbol || TICKER_BLACKLIST.includes(symbol) || symbol.length > 8 || !isNaN(Number(symbol))) return;
      const current = numv(cols[col.CURRENT]?.textContent);
      if (current <= 0) return;
      const ldcp = numv(cols[col.LDCP]?.textContent);
      const change = numv(cols[col.CHANGE]?.textContent) || (ldcp ? current - ldcp : 0);
      const changePct = ldcp > 0 ? (change / ldcp) * 100 : 0;
      const volume = numv(cols[col.VOLUME]?.textContent);
      out.push({ symbol, current, ldcp, changePct, volume });
    });
  });
  const best = new Map<string, Candidate>();
  out.forEach((c) => { const p = best.get(c.symbol); if (!p || c.volume > p.volume) best.set(c.symbol, c); });
  return Array.from(best.values()).sort((a, b) => b.volume - a.volume);
};

const buildUniverse = (candidates: Candidate[], universe: ScanUniverse, watchlist: string[]): Candidate[] => {
  if (universe === 'KSE100') return candidates.filter((c) => KSE100_SET.has(c.symbol));
  if (universe === 'KMI30') return candidates.filter((c) => KMI30_SET.has(c.symbol));
  const wl = new Set(watchlist.map((s) => s.toUpperCase()));
  return candidates.filter((c) => wl.has(c.symbol));
};

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | void>,
  onProgress?: (done: number) => void
): Promise<void> {
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      try { await fn(items[i]); } catch { /* skip */ }
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const loadDailyScan = (): DailyScanSnapshot | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyScanSnapshot;
  } catch {
    return null;
  }
};

export const saveDailyScan = (snap: DailyScanSnapshot): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
};

export const loadScanBotSettings = (): ScanBotSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveScanBotSettings = (s: ScanBotSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
};

export const isScanStale = (snap: DailyScanSnapshot | null, staleHours: number): boolean => {
  if (!snap?.scannedAt) return true;
  return Date.now() - snap.scannedAt > staleHours * 3600000;
};

export interface RunDailyScanOpts {
  universe: ScanUniverse;
  mode: ScanMode;
  watchlist?: string[];
  onProgress?: (done: number, total: number) => void;
}

/** Run a full market scan — no Gemini, same rules as Market Signals. */
export const runDailyScan = async (opts: RunDailyScanOpts): Promise<DailyScanSnapshot> => {
  const html = await fetchUrlWithFallback('https://dps.psx.com.pk/market-watch');
  if (!html || html.length < 500) throw new Error('Could not fetch the market snapshot. Try again in a moment.');

  const watchlist = opts.watchlist || [];
  const candidates = buildUniverse(parseCandidates(html), opts.universe, watchlist);
  if (candidates.length === 0) {
    throw new opts.universe === 'WATCHLIST'
      ? new Error('Watchlist is empty or none of your tickers appeared in today\'s market snapshot.')
      : new Error('No matching stocks found for this universe.');
  }

  const rsiMode = opts.mode === 'rsi_oversold';
  const concurrency = candidates.length > 80 ? 8 : 6;
  const hits: DailyScanHit[] = [];
  const btParts: ReturnType<typeof backtestRsiOversold>[] = [];

  await mapPool(candidates, concurrency, async (c) => {
    const history = await fetchStockHistory(c.symbol, '1Y');
    const closes = history.map((h) => h.price);
    if (closes.length < 35) return;
    const summary = computeSignal(closes);

    if (rsiMode) {
      const bt = backtestRsiOversold(closes);
      btParts.push(bt);
      if (!(summary.rsi < 30)) return;
      const plan = computeRsiOversoldPlan(c.current);
      hits.push({
        symbol: c.symbol,
        current: c.current,
        changePct: c.changePct,
        volume: c.volume,
        verdict: 'BUY',
        rsi: summary.rsi,
        score: summary.score,
        stop: plan?.stop,
        target: plan?.targets[0],
        backtestWinRate: bt.trades > 0 ? bt.winRate : undefined,
        backtestTrades: bt.trades > 0 ? bt.trades : undefined,
        backtestAvgReturnPct: bt.trades > 0 ? bt.avgReturnPct : undefined,
      });
      return;
    }

    if (!(summary.verdict === 'BUY' || summary.verdict === 'STRONG BUY')) return;
    const plan = computeTradePlan(closes, c.current);
    hits.push({
      symbol: c.symbol,
      current: c.current,
      changePct: c.changePct,
      volume: c.volume,
      verdict: summary.verdict,
      rsi: summary.rsi,
      score: summary.score,
      stop: plan?.stop,
      target: plan?.targets[0],
    });
  }, (done) => opts.onProgress?.(done, candidates.length));

  if (rsiMode) {
    hits.sort((a, b) => a.rsi - b.rsi || b.volume - a.volume);
  } else {
    hits.sort((a, b) => b.score - a.score || b.volume - a.volume);
  }

  const agg = rsiMode ? mergeRsiOversoldBacktests(btParts) : undefined;
  const snap: DailyScanSnapshot = {
    scannedAt: Date.now(),
    universe: opts.universe,
    mode: opts.mode,
    hits,
    totalScanned: candidates.length,
    aggBacktest: agg && agg.trades > 0 ? {
      trades: agg.trades,
      winRate: agg.winRate,
      avgReturnPct: agg.avgReturnPct,
    } : undefined,
  };
  saveDailyScan(snap);
  return snap;
};

/** Compact summary for PSX Assistant tool responses. */
export const formatDailyScanForAgent = (snap: DailyScanSnapshot | null): Record<string, unknown> => {
  if (!snap) return { note: 'No daily scan has been run yet. Ask the user to open Daily Scan and run a scan first.' };
  return {
    scanned_at: new Date(snap.scannedAt).toISOString(),
    universe: snap.universe,
    mode: snap.mode,
    total_scanned: snap.totalScanned,
    hits_count: snap.hits.length,
    aggregate_backtest_1y: snap.aggBacktest || null,
    hits: snap.hits.slice(0, 25).map((h) => ({
      symbol: h.symbol,
      price_pkr: h.current,
      change_percent: Math.round(h.changePct * 100) / 100,
      verdict: h.verdict,
      rsi14: Math.round(h.rsi * 10) / 10,
      score: Math.round(h.score * 100) / 100,
      stop_pkr: h.stop,
      target_pkr: h.target,
      backtest_1y_win_rate_percent: h.backtestWinRate,
      backtest_1y_trades: h.backtestTrades,
    })),
    note: snap.hits.length > 25 ? `Showing top 25 of ${snap.hits.length} hits.` : undefined,
  };
};
