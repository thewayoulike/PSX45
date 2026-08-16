import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Holding } from '../types';
import { fetchBatchPSXPrices } from '../services/psxData';
import { KSE100, KMI30 } from '../services/indices';
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Star, Flame } from 'lucide-react';

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

type IndexKey = 'KSE100' | 'KMI30';
type Dir = 'gainers' | 'losers';

interface Row {
  ticker: string;
  price: number;
  change: number;
  volume: number;
  high: number;
  low: number;
}

const REFRESH_MS = 5 * 60 * 1000;
const rs = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vol = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n > 0 ? String(n) : '—';

export const TopMovers: React.FC<Props> = ({ holdings, onSelectTicker }) => {
  const [index, setIndex] = useState<IndexKey>('KSE100');
  const [dir, setDir] = useState<Dir>('gainers');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const owned = useMemo(() => new Set(holdings.map(h => h.ticker.toUpperCase())), [holdings]);

  const load = async (idx: IndexKey) => {
    const universe = idx === 'KSE100' ? KSE100 : KMI30;
    setLoading(true);
    try {
      const data = await fetchBatchPSXPrices(universe);
      const out: Row[] = [];
      universe.forEach(t => {
        const d = (data as any)[t];
        if (d && d.price > 0 && d.ldcp > 0) {
          out.push({
            ticker: t,
            price: d.price,
            change: ((d.price - d.ldcp) / d.ldcp) * 100,
            volume: d.volume || 0,
            high: d.high || 0,
            low: d.low || 0,
          });
        }
      });
      setRows(out);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('TopMovers fetch failed', e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when the index changes, then refresh every 5 minutes.
  useEffect(() => {
    load(index);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => load(index), REFRESH_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const list = useMemo(() => {
    const sorted = [...rows].sort((a, b) => dir === 'gainers' ? b.change - a.change : a.change - b.change);
    return sorted.slice(0, 10);
  }, [rows, dir]);

  const idxChip = (k: IndexKey) => `px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${index === k ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`;
  const dirChip = (d: Dir) => {
    const on = dir === d;
    const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all';
    if (d === 'gainers') return `${base} ${on ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`;
    return `${base} ${on ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <Flame size={16} className="text-orange-500" /> Top Movers
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            <button onClick={() => setIndex('KSE100')} className={idxChip('KSE100')}>KSE-100</button>
            <button onClick={() => setIndex('KMI30')} className={idxChip('KMI30')}>KMI-30</button>
          </div>
          <button onClick={() => load(index)} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Gainers / losers toggle */}
      <div className="flex bg-slate-50 dark:bg-slate-800/50 rounded-xl p-1 mb-4 w-fit">
        <button onClick={() => setDir('gainers')} className={dirChip('gainers')}><TrendingUp size={13} /> Gainers</button>
        <button onClick={() => setDir('losers')} className={dirChip('losers')}><TrendingDown size={13} /> Losers</button>
      </div>

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">No data available. Try refreshing during market hours.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="text-left font-bold py-2 px-1 w-6">#</th>
                <th className="text-left font-bold py-2 px-1">Symbol</th>
                <th className="text-right font-bold py-2 px-2">Price</th>
                <th className="text-right font-bold py-2 px-2">Chg %</th>
                <th className="text-right font-bold py-2 px-2">Volume</th>
                <th className="text-right font-bold py-2 px-2 hidden sm:table-cell">High</th>
                <th className="text-right font-bold py-2 px-2 hidden sm:table-cell">Low</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {list.map((r, i) => {
                const up = r.change >= 0;
                const isOwned = owned.has(r.ticker);
                return (
                  <tr
                    key={r.ticker}
                    onClick={() => onSelectTicker?.(r.ticker)}
                    className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-1 text-xs font-bold text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-display font-black text-slate-800 dark:text-white">{r.ticker}</span>
                        {isOwned && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">{rs(r.price)}</td>
                    <td className={`py-2.5 px-2 text-right font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                      {up ? '+' : ''}{r.change.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{vol(r.volume)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">{r.high > 0 ? rs(r.high) : '—'}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">{r.low > 0 ? rs(r.low) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[10px] text-slate-400">
          {index === 'KSE100' ? 'KSE-100' : 'KMI-30'} · {dir === 'gainers' ? 'top gainers' : 'top losers'} today
          {holdings.length > 0 && <> · <Star size={9} className="inline text-amber-500 fill-amber-500" /> = you hold</>}
        </span>
        {lastUpdated && <span className="text-[10px] text-slate-400 tabular-nums">Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
};
