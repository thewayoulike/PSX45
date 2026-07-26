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
const fmt = (n?: number | null, d = 2) =>
  (n == null || Number.isNaN(n) || !Number.isFinite(n))
    ? '—'
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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

const VERDICT_STYLE: Record<Verdict, { text: string; bg: string; border: string }> = {
  'STRONG BUY': { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20', border: 'border-emerald-200 dark:border-emerald-500/30' },
  'BUY': { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20' },
  'NEUTRAL': { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' },
  'SELL': { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-100 dark:border-rose-500/20' },
  'STRONG SELL': { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-500/20', border: 'border-rose-200 dark:border-rose-500/30' },
};

const chip = (s: Signal) =>
  s === 'BUY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  : s === 'SELL' ? 'bg-rose-50 text-rose-600 border border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
  : 'bg-slate-50 text-slate-500 border border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

// ---------- Detailed card ----------
const SignalCard: React.FC<{ result: Result; onClick?: (s: string) => void }> = ({ result, onClick }) => {
  const { symbol, current, changePct, summary, plan } = result;
  const style = VERDICT_STYLE[summary.verdict];
  const markerPct = ((summary.score + 1) / 2) * 100;
  const up = changePct >= 0;

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark overflow-hidden hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 group">
      <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm shrink-0">
            <Activity size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <button onClick={() => onClick?.(symbol)} className="text-lg font-display font-black text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors tracking-tight">
              {symbol}
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">1Y Technicals</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display font-black text-xl text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">{fmt(current)}</div>
          <div className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ml-auto w-fit mt-1 ${up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400'}`}>
            {up ? '+' : '−'}{fmt(Math.abs(changePct))}%
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`px-6 py-2.5 rounded-2xl text-lg font-display font-black uppercase tracking-widest border shadow-sm ${style.bg} ${style.text} ${style.border}`}>
            {summary.verdict}
          </div>
          <div className="flex gap-4 mt-3 text-xs font-bold uppercase tracking-widest tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">{summary.buys} Buy</span>
            <span className="text-slate-400">{summary.neutrals} Neut</span>
            <span className="text-rose-500 dark:text-rose-400">{summary.sells} Sell</span>
          </div>
        </div>

        <div className="relative mb-6 px-1">
          <div className="h-3 rounded-full overflow-hidden flex shadow-inner">
            <div className="flex-1 bg-rose-500/90" />
            <div className="flex-1 bg-rose-400/70" />
            <div className="flex-1 bg-slate-200 dark:bg-slate-700/80" />
            <div className="flex-1 bg-emerald-400/70" />
            <div className="flex-1 bg-emerald-500/90" />
          </div>
          <div className="absolute top-[-5px] w-2 h-5 bg-white dark:bg-slate-200 rounded-full shadow-md border border-slate-300 dark:border-slate-500 -translate-x-1/2 transition-all duration-700 ease-out" style={{ left: `${markerPct}%` }} />
          <div className="flex justify-between text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-widest opacity-80">
            <span>Strong Sell</span><span>Neutral</span><span>Strong Buy</span>
          </div>
        </div>

        {plan && (
          <div className="mb-5">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500 mb-1">Buy Range</div>
                <div className="font-mono font-bold text-sm text-emerald-900 dark:text-emerald-100 tabular-nums">{fmt(plan.entryLow)} – {fmt(plan.entryHigh)}</div>
              </div>
              <div className="rounded-2xl bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/50 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-500 mb-1">Stop Loss</div>
                <div className="font-mono font-bold text-sm text-rose-900 dark:text-rose-100 tabular-nums">
                  {fmt(plan.stop)} <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded shadow-sm ml-1">(−{fmt(plan.riskPct)}%)</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {plan.targets.map((t, i) => (
                <div key={i} className="rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-2.5 text-center shadow-sm">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Target {i + 1}</div>
                  <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(t)}</div>
                  <div className="text-[9px] font-bold text-slate-400 tabular-nums">+{fmt(plan.rewardPct[i])}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden shadow-sm bg-white dark:bg-slate-900/50">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-left border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Indicator</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">Value</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-center">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {summary.indicators.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-bold">{row.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums font-medium">{row.value}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold shadow-sm ${chip(row.signal)}`}>{row.signal}</span>
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
    <th className={`px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ${className}`}>{children}</th>
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm min-w-[860px] whitespace-nowrap">
        <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-left sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
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
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {rows.map((r) => {
            const up = r.changePct >= 0;
            const vs = VERDICT_STYLE[r.summary.verdict];
            const rsiColor = r.summary.rsi < 30 ? 'text-amber-600 dark:text-amber-400' : r.summary.rsi > 70 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
            return (
              <tr key={r.symbol} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group">
                <td className="px-4 py-3">
                  <button onClick={() => onClick?.(r.symbol)} className="font-display font-black text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{r.symbol}</button>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmt(r.current)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    <span className={`px-1.5 py-0.5 rounded ${up ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                        {up ? '+' : '−'}{fmt(Math.abs(r.changePct))}%
                    </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{fmt(r.summary.sma20)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{fmt(r.summary.sma50)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${rsiColor}`}>{fmt(r.summary.rsi, 1)}</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{r.plan ? fmt(r.plan.support) : '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-rose-500 dark:text-rose-400 font-bold tabular-nums">{r.plan ? fmt(r.plan.resistance) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold border shadow-sm ${vs.bg} ${vs.text} ${vs.border}`}>{r.summary.verdict}</span>
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 max-w-[1600px] mx-auto">
      {/* Header / controls */}
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm shrink-0">
              <Radar size={24} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Buy Signal Scanner</h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                {scannedAt ? `Scanned ${scannedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Found ${shown.length} signals` : 'Automated technical scans across PSX listings'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
              <button onClick={() => setView('cards')} title="Card view" className={`p-2 rounded-lg transition-all ${view === 'cards' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => setView('table')} title="Table view" className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                <TableIcon size={16} />
              </button>
            </div>
            
            <div className="relative">
                <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                disabled={status === 'scanning'}
                className="appearance-none glass-input rounded-xl pl-4 pr-9 py-2.5 text-sm font-bold outline-none shadow-sm disabled:opacity-50"
                >
                <option value="KSE100">KSE-100 index</option>
                <option value="KMI30">KMI-30 index</option>
                <option value="20">Top 20 by volume</option>
                <option value="40">Top 40 by volume</option>
                <option value="60">Top 60 by volume</option>
                <option value="100">Top 100 by volume</option>
                <option value="ALL">All market (slow)</option>
                </select>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input type="checkbox" checked={buyOnly} onChange={(e) => setBuyOnly(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300" />
              Buys Only
            </label>
            
            {results.length > 0 && (
              <button onClick={copyAll} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:-translate-y-0.5 active:translate-y-0 shrink-0">
                {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />} Copy
              </button>
            )}
            
            <button
              onClick={runScan}
              disabled={status === 'scanning'}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 shrink-0"
            >
              {status === 'scanning' ? <Loader2 size={18} className="animate-spin" /> : <Radar size={18} />}
              {status === 'scanning' ? 'Scanning…' : 'Scan Market'}
            </button>
          </div>
        </div>

        {isAll && status !== 'scanning' && (
          <div className="mt-4 p-3 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 flex items-start gap-2 shadow-sm">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>Full-market scan downloads a year of daily prices for every listed stock. This can take several minutes, and highly illiquid/thin stocks will be automatically skipped.</p>
          </div>
        )}

        {status === 'scanning' && (
          <div className="mt-5 px-2 pb-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              <span>Analyzing {progress.total} stocks…</span>
              <span className="tabular-nums">{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-2xl text-sm font-bold text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in">
          {error}
        </div>
      )}

      {status === 'idle' && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5 shadow-inner">
             <TrendingUp size={36} className="text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ready to Scan</h3>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">Hit “Scan Market” to find stocks flashing a technical buy signal.</p>
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-xl text-xs text-slate-500 dark:text-slate-400 max-w-md shadow-sm leading-relaxed">
             Pick a universe — KSE-100, KMI-30, or top movers — and the engine runs moving averages, RSI, MACD, and momentum on each to build an automated buy range, stop loss, and target prices.
          </div>
        </div>
      )}

      {/* Results */}
      {shown.length > 0 && view === 'table' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <ScreenerTable rows={shown} onClick={onSymbolClick} />
        </div>
      )}
      {shown.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {shown.map((r) => (
            <SignalCard key={r.symbol} result={r} onClick={onSymbolClick} />
          ))}
        </div>
      )}

      {status === 'done' && shown.length === 0 && !error && (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-16 text-center shadow-sm">
          <p className="text-slate-500 dark:text-slate-400 font-bold text-lg">No buy signals in this batch.</p>
          <p className="text-slate-400 text-sm mt-2">Try scanning a larger universe or uncheck “Buys only” to see neutral and sell ratings.</p>
        </div>
      )}

      {/* Disclaimer */}
      {results.length > 0 && (
        <div className="flex items-start gap-3 bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed shadow-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p>
            <strong className="text-slate-700 dark:text-slate-300">Disclaimer:</strong> Mechanical technical signals and auto-calculated levels are generated for educational purposes only and do not constitute investment advice. Buy/sell
            zones, stops, and targets are derived from recent historical volatility and simple SMA/RSI heuristic algorithms; they are estimates and are prone to error in unpredictable market conditions. Data is unofficial and may be delayed. Always perform your own due diligence.
          </p>
        </div>
      )}
    </div>
  );
};
