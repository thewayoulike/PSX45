import React, { useState, useCallback } from 'react';
import { Radar, Loader2, Copy, CheckCircle2, Search, TrendingUp, Info } from 'lucide-react';
import { fetchUrlWithFallback, fetchStockHistory } from '../services/psxData';
import { computeSignal, SignalSummary, Verdict } from '../utils/indicators';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'INDEX', 'KSE'];
const CONCURRENCY = 6;

interface Candidate { symbol: string; current: number; ldcp: number; changePct: number; volume: number; }
interface Result extends Candidate { summary: SignalSummary; }

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

const VERDICT_STYLE: Record<Verdict, string> = {
  'STRONG BUY': 'bg-emerald-600 text-white',
  'BUY': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'NEUTRAL': 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  'SELL': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'STRONG SELL': 'bg-rose-600 text-white',
};

export const MarketSignalScanner: React.FC<{ onSymbolClick?: (s: string) => void }> = ({ onSymbolClick }) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [universe, setUniverse] = useState(40);
  const [buyOnly, setBuyOnly] = useState(true);
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

      const candidates = parseCandidates(html).slice(0, universe);
      if (candidates.length === 0) throw new Error('No tradable stocks found in the snapshot.');

      setProgress({ done: 0, total: candidates.length });

      const collected: Result[] = [];
      await mapPool(candidates, CONCURRENCY, async (c) => {
        const history = await fetchStockHistory(c.symbol, '1Y');
        const closes = history.map((h) => h.price);
        if (closes.length < 35) return;
        const summary = computeSignal(closes);
        collected.push({ ...c, summary });
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
    const header = 'SYMBOL\tPRICE\tCHANGE %\tSIGNAL\tBUY\tSELL';
    const body = shown.map((r) =>
      `${r.symbol}\t${fmt(r.current)}\t${fmt(r.changePct)}\t${r.summary.verdict}\t${r.summary.buys}\t${r.summary.sells}`
    ).join('\n');
    await navigator.clipboard.writeText(`${header}\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Radar size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Buy Signal Scanner</h2>
              <p className="text-xs text-slate-400">
                {scannedAt ? `Scanned ${scannedAt.toLocaleString()} · ${shown.length} signals` : 'Scans the most active stocks for technical buy signals'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={universe}
              onChange={(e) => setUniverse(Number(e.target.value))}
              disabled={status === 'scanning'}
              className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 outline-none dark:text-slate-200"
            >
              <option value={20}>Top 20 by volume</option>
              <option value={40}>Top 40 by volume</option>
              <option value={60}>Top 60 by volume</option>
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
              {status === 'scanning' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {status === 'scanning' ? 'Scanning…' : 'Scan Market'}
            </button>
          </div>
        </div>

        {/* Progress */}
        {status === 'scanning' && (
          <div className="p-4 sm:p-5">
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
          <div className="m-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Idle empty state */}
        {status === 'idle' && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <TrendingUp size={34} className="text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Hit “Scan Market” to find stocks flashing a buy signal.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">It pulls a year of prices for the most active stocks and runs moving averages, RSI, MACD and momentum on each. Takes ~15–40 seconds.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
                <tr>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Symbol</th>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Price</th>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Change %</th>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Signal</th>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Buy / Sell</th>
                  <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((r) => {
                  const up = r.changePct >= 0;
                  return (
                    <tr key={r.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <button onClick={() => onSymbolClick?.(r.symbol)} className="font-bold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                          {r.symbol}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">{fmt(r.current)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {up ? '+' : '−'}{fmt(Math.abs(r.changePct))}%
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${VERDICT_STYLE[r.summary.verdict]}`}>{r.summary.verdict}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">{r.summary.buys}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-rose-500 dark:text-rose-400">{r.summary.sells}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500 dark:text-slate-400">{fmtVol(r.volume)}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-400 text-sm">
                      No buy signals in this batch. Try a larger universe or uncheck “Buys only” to see all ratings.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-4 sm:px-5 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Mechanical technical signals for educational purposes only — not investment advice. Based on past price action across the
            most-active stocks (not the whole market), and can be wrong. Always do your own research.
          </span>
        </div>
      </div>
    </div>
  );
};
