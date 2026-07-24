import React, { useState, useCallback } from 'react';
import { Radar, Loader2, Copy, CheckCircle2, TrendingUp, Info, Activity, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { fetchUrlWithFallback, fetchStockHistory } from '../services/psxData';
import { computeSignal, computeTradePlan, SignalSummary, TradePlan, Signal, Verdict } from '../utils/indicators';
import { KSE100_SET, KMI30_SET } from '../services/indices';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'INDEX', 'KSE'];

interface Candidate { symbol: string; current: number; ldcp: number; changePct: number; volume: number; }
interface Result extends Candidate { summary: SignalSummary; plan: TradePlan | null; }

const numv = (s?: string | null) => {
  const v = parseFloat((s || '').replace(/,/g, '').trim());
  return isNaN(v) ? 0 : v;
};
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtVol = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

// Parse market-watch snapshot into liquidity-ranked candidates.
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

// Pick the scan universe from parsed candidates.
const buildUniverse = (candidates: Candidate[], u: string): Candidate[] => {
  if (u === 'KSE100') return candidates.filter((c) => KSE100_SET.has(c.symbol));
  if (u === 'KMI30') return candidates.filter((c) => KMI30_SET.has(c.symbol));
  if (u === 'ALL') return candidates;
  const n = Number(u) || 40;
  return candidates.slice(0, n);
};

// Run an async fn over items with limited concurrency.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onProgress: (done: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i]); } catch { /* skip */ }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const VERDICT_STYLE: Record<Verdict, { text: string; bg: string }> = {
  'STRONG BUY': { text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  'BUY': { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/25' },
  'NEUTRAL': { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
  'SELL': { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/25' },
  'STRONG SELL': { text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100 dark:bg-rose-900/40' },
};

const chip = (s: Signal) =>
  s === 'BUY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  : s === 'SELL' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

// ---------- Detailed card ----------
const SignalCard: React.FC<{ result: Result; onClick?: (s: string) => void }> = ({ result, onClick }) => {
  const { symbol, current, changePct, summary, plan } = result;
  const style = VERDICT_STYLE[summary.verdict];
  const markerPct = ((summary.score + 1) / 2) * 100;
  const up = changePct >= 0;

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Activity size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <button onClick={() => onClick?.(symbol)} className="text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Technical signal — {symbol}
            </button>
            <p className="text-xs text-slate-400">Based on daily price history (1Y)</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">{fmt(current)}</div>
          <div className={`text-xs font-bold font-mono ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {up ? '+' : '−'}{fmt(Math.abs(changePct))}%
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-col items-center text-center mb-4">
          <div className={`px-5 py-2 rounded-xl text-lg font-extrabold tracking-wide ${style.bg} ${style.text}`}>
            {summary.verdict}
          </div>
          <div className="flex gap-4 mt-3 text-xs font-bold">
            <span className="text-emerald-600 dark:text-emerald-400">{summary.buys} buy</span>
            <span className="text-slate-400">{summary.neutrals} neutral</span>
            <span className="text-rose-500 dark:text-rose-400">{summary.sells} sell</span>
          </div>
        </div>

        <div className="relative mb-5 px-1">
          <div className="h-2.5 rounded-full overflow-hidden flex">
            <div className="flex-1 bg-rose-500/80" />
            <div className="flex-1 bg-rose-300/70" />
            <div className="flex-1 bg-slate-300 dark:bg-slate-600" />
            <div className="flex-1 bg-emerald-300/70" />
            <div className="flex-1 bg-emerald-500/80" />
          </div>
          <div className="absolute -top-1 w-1.5 h-[18px] bg-slate-900 dark:bg-white rounded-full shadow -translate-x-1/2" style={{ left: `${markerPct}%` }} />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1.5 font-bold uppercase tracking-wide">
            <span>Strong Sell</span><span>Neutral</span><span>Strong Buy</span>
          </div>
        </div>

        {plan && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Buy Range</div>
                <div className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">{fmt(plan.entryLow)} – {fmt(plan.entryHigh)}</div>
              </div>
              <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">Stop Loss</div>
                <div className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                  {fmt(plan.stop)} <span className="text-[11px] font-normal text-rose-500 dark:text-rose-400">(−{fmt(plan.riskPct)}%)</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {plan.targets.map((t, i) => (
                <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Target {i + 1}</div>
                  <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">{fmt(t)}</div>
                  <div className="text-[10px] text-slate-400">+{fmt(plan.rewardPct[i])}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr>
                <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Indicator</th>
                <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Value</th>
                <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summary.indicators.map((row) => (
                <tr key={row.name}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-400">{row.value}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${chip(row.signal)}`}>{row.signal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ---------- Compact table (screener style) ----------
const ScreenerTable: React.FC<{ rows: Result[]; onClick?: (s: string) => void }> = ({ rows, onClick }) => {
  const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className}`}>{children}</th>
  );
  return (
    <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-left sticky top-0">
          <tr>
            <Th>Symbol</Th>
            <Th className="text-right">Price</Th>
            <Th className="text-right">Chg %</Th>
            <Th className="text-right">SMA 20</Th>
            <Th className="text-right">SMA 50</Th>
            <Th className="text-right">RSI 14</Th>
            <Th className="text-right">Buy zone</Th>
            <Th className="text-right">Sell zone</Th>
            <Th className="text-center">Signal</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => {
            const up = r.changePct >= 0;
            const vs = VERDICT_STYLE[r.summary.verdict];
            const rsiColor = r.summary.rsi < 30 ? 'text-amber-600 dark:text-amber-400' : r.summary.rsi > 70 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
            return (
              <tr key={r.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-2">
                  <button onClick={() => onClick?.(r.symbol)} className="font-bold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{r.symbol}</button>
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">{fmt(r.current)}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{up ? '+' : '−'}{fmt(Math.abs(r.changePct))}%</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-400">{fmt(r.summary.sma20)}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-400">{fmt(r.summary.sma50)}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${rsiColor}`}>{fmt(r.summary.rsi, 1)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{r.plan ? fmt(r.plan.support) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-500 dark:text-rose-400">{r.plan ? fmt(r.plan.resistance) : '—'}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${vs.bg} ${vs.text}`}>{r.summary.verdict}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const MarketSignalScanner: React.FC<{ onSymbolClick?: (s: string) => void }> = ({ onSymbolClick }) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [universe, setUniverse] = useState<string>('40');
  const [buyOnly, setBuyOnly] = useState(true);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [copied, setCopied] = useState(false);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);

  const runScan = useCallback(async () => {
    setStatus('scanning');
    setError('');
    setResults([]);
    setProgress({ done: 0, total: 0 });
    try {
      const html = await fetchUrlWithFallback('https://dps.psx.com.pk/market-watch');
      if (!html || html.length < 500) throw new Error('Could not fetch the market snapshot. Try again in a moment.');

      const candidates = buildUniverse(parseCandidates(html), universe);
      if (candidates.length === 0) throw new Error('No matching stocks found. If you scanned an index, check the constituent list in indices.ts.');

      // Bigger scans get more concurrency; auto-switch to the compact table.
      const concurrency = candidates.length > 80 ? 8 : 6;
      if (candidates.length > 40) setView('table');

      setProgress({ done: 0, total: candidates.length });

      const collected: Result[] = [];
      await mapPool(candidates, concurrency, async (c) => {
        const history = await fetchStockHistory(c.symbol, '1Y');
        const closes = history.map((h) => h.price);
        if (closes.length < 35) return;
        const summary = computeSignal(closes);
        const plan = computeTradePlan(closes, c.current);
        collected.push({ ...c, summary, plan });
      }, (done) => setProgress((p) => ({ ...p, done })));

      collected.sort((a, b) => b.summary.score - a.summary.score || b.volume - a.volume);
      setResults(collected);
      setScannedAt(new Date());
      setStatus('done');
    } catch (e: any) {
      setError(e.message || 'Scan failed.');
      setStatus('idle');
    }
  }, [universe]);

  const shown = results.filter((r) =>
    buyOnly ? (r.summary.verdict === 'BUY' || r.summary.verdict === 'STRONG BUY') : true
  );

  const copyAll = async () => {
    const header = 'SYMBOL\tPRICE\tCHG %\tSMA20\tSMA50\tRSI14\tBUY ZONE\tSELL ZONE\tSIGNAL';
    const body = shown.map((r) =>
      `${r.symbol}\t${fmt(r.current)}\t${fmt(r.changePct)}\t${fmt(r.summary.sma20)}\t${fmt(r.summary.sma50)}\t${fmt(r.summary.rsi, 1)}\t${r.plan ? fmt(r.plan.support) : ''}\t${r.plan ? fmt(r.plan.resistance) : ''}\t${r.summary.verdict}`
    ).join('\n');
    await navigator.clipboard.writeText(`${header}\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const isAll = universe === 'ALL';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-4">
      {/* Header / controls */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Radar size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Buy Signal Scanner</h2>
              <p className="text-xs text-slate-400">
                {scannedAt ? `Scanned ${scannedAt.toLocaleString()} · ${shown.length} signals` : 'Scans stocks for technical buy signals'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setView('cards')} title="Card view" className={`p-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400'}`}>
                <LayoutGrid size={14} />
              </button>
              <button onClick={() => setView('table')} title="Table view" className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400'}`}>
                <TableIcon size={14} />
              </button>
            </div>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              disabled={status === 'scanning'}
              className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 outline-none dark:text-slate-200"
            >
              <option value="KSE100">KSE-100 index</option>
              <option value="KMI30">KMI-30 index</option>
              <option value="20">Top 20 by volume</option>
              <option value="40">Top 40 by volume</option>
              <option value="60">Top 60 by volume</option>
              <option value="100">Top 100 by volume</option>
              <option value="ALL">All market (slow)</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={buyOnly} onChange={(e) => setBuyOnly(e.target.checked)} className="accent-emerald-600" />
              Buys only
            </label>
            {results.length > 0 && (
              <button onClick={copyAll} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />} Copy
              </button>
            )}
            <button
              onClick={runScan}
              disabled={status === 'scanning'}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              {status === 'scanning' ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
              {status === 'scanning' ? 'Scanning…' : 'Scan Market'}
            </button>
          </div>
        </div>

        {isAll && status !== 'scanning' && (
          <div className="mx-4 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            Full-market scan downloads a year of prices for every listed stock — it can take a few minutes and some thin stocks will be skipped.
          </div>
        )}

        {status === 'scanning' && (
          <div className="px-4 sm:px-5 pb-4">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
              <span>Analyzing {progress.total} stocks…</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {status === 'idle' && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4 border-t border-slate-100 dark:border-slate-800">
            <TrendingUp size={34} className="text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Hit “Scan Market” to find stocks flashing a buy signal.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">Pick a universe — KSE-100, KMI-30, top movers, or the whole market — then it runs moving averages, RSI, MACD and momentum on each and builds a buy range, stop and targets.</p>
          </div>
        )}
      </div>

      {/* Results */}
      {shown.length > 0 && view === 'table' && (
        <ScreenerTable rows={shown} onClick={onSymbolClick} />
      )}
      {shown.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shown.map((r) => (
            <SignalCard key={r.symbol} result={r} onClick={onSymbolClick} />
          ))}
        </div>
      )}

      {status === 'done' && shown.length === 0 && !error && (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-400 text-sm">
          No buy signals in this batch. Try a larger universe or uncheck “Buys only” to see all ratings.
        </div>
      )}

      {/* Disclaimer */}
      {results.length > 0 && (
        <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed px-1">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Mechanical technical signals and auto-calculated levels for educational purposes only — not investment advice. Buy/sell
            zones, stop and targets come from recent volatility and simple SMA/RSI heuristics; they are estimates and can be wrong.
            Data is unofficial and delayed. Always do your own research.
          </span>
        </div>
      )}
    </div>
  );
};
