import React, { useMemo, useState } from 'react';
import { Trophy, TrendingDown } from 'lucide-react';

// Each entry: { rawDate, Portfolio, KSE100, KMI30 }  (daily return %)
interface Props { data: any[]; }

type Win = '1D' | '1W' | '1M';

const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400');

// Compound daily % returns into a cumulative % for the window.
const cum = (rows: any[], key: string) => (rows.reduce((acc, d) => acc * (1 + (Number(d[key]) || 0) / 100), 1) - 1) * 100;

export const BenchmarkPanel: React.FC<Props> = ({ data }) => {
  const [win, setWin] = useState<Win>('1M');

  const stats = useMemo(() => {
    const clean = (data || []).filter(d => d && d.rawDate);
    const rows = win === '1D' ? clean.slice(-1) : win === '1W' ? clean.slice(-5) : clean;
    if (rows.length === 0) return null;
    const port = cum(rows, 'Portfolio');
    const kse = cum(rows, 'KSE100');
    const kmi = cum(rows, 'KMI30');
    return { port, kse, kmi, vsKse: port - kse, vsKmi: port - kmi };
  }, [data, win]);

  const chip = (active: boolean) => `px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">Performance vs Index</h3>
        <div className="flex gap-1.5">
          {(['1D', '1W', '1M'] as Win[]).map(w => (
            <button key={w} onClick={() => setWin(w)} className={chip(win === w)}>{w === '1M' ? '1 Month' : w === '1W' ? '1 Week' : 'Today'}</button>
          ))}
        </div>
      </div>

      {!stats ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">Generate the performance chart below to unlock this comparison.</p>
      ) : (
        <>
          {/* Headline */}
          <div className={`flex items-center gap-2 mb-4 p-3 rounded-2xl ${stats.vsKse >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
            {stats.vsKse >= 0 ? <Trophy size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <TrendingDown size={18} className="text-rose-500 shrink-0" />}
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {stats.vsKse >= 0 ? 'Beating' : 'Lagging'} KSE-100 by <span className={posNeg(stats.vsKse)}>{spct(Math.abs(stats.vsKse)).replace('+', '')}</span> {win === '1D' ? 'today' : win === '1W' ? 'this week' : 'this month'}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your Portfolio</div>
              <div className={`text-lg font-display font-black tabular-nums ${posNeg(stats.port)}`}>{spct(stats.port)}</div>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">KSE-100</div>
              <div className={`text-lg font-display font-black tabular-nums ${posNeg(stats.kse)}`}>{spct(stats.kse)}</div>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">KMI-30</div>
              <div className={`text-lg font-display font-black tabular-nums ${posNeg(stats.kmi)}`}>{spct(stats.kmi)}</div>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Outperformance</div>
              <div className={`text-lg font-display font-black tabular-nums ${posNeg(stats.vsKse)}`}>{spct(stats.vsKse)}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-snug">Compounded daily returns over the selected window (from your generated history, up to ~1 month).</p>
        </>
      )}
    </div>
  );
};
