import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, TrendingDown } from 'lucide-react';
import { fetchStockHistory } from '../services/psxData';

// Each entry: { rawDate, Portfolio, KSE100, KMI30 }  (daily return %)
interface Props {
  data: any[];
  // Live "today" portfolio move (same number as the Today's P&L card). Optional.
  portfolioTodayPct?: number | null;
}

type Win = '1D' | '1W' | '1M';

const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400');

// Compound daily % returns into a cumulative % for the window.
const cum = (rows: any[], key: string) => (rows.reduce((acc, d) => acc * (1 + (Number(d[key]) || 0) / 100), 1) - 1) * 100;

// Close-to-close % from a fetchStockHistory series (last vs previous point).
const lastChangePct = (arr: { time: number; price: number }[] | undefined): number | null => {
  if (!arr || arr.length < 2) return null;
  const a = arr[arr.length - 1].price;
  const b = arr[arr.length - 2].price;
  return b > 0 ? ((a - b) / b) * 100 : null;
};

export const BenchmarkPanel: React.FC<Props> = ({ data, portfolioTodayPct }) => {
  const [win, setWin] = useState<Win>('1M');
  // Live today's index moves — same source as the Index bar, so the "Today" tab
  // matches reality instead of the last (stale, end-of-day) row of the history.
  const [live, setLive] = useState<{ kse: number | null; kmi: number | null }>({ kse: null, kmi: null });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [kse, kmi] = await Promise.all([
          fetchStockHistory('KSE100', '1M'),
          fetchStockHistory('KMI30', '1M'),
        ]);
        if (alive) {
          setLive({ kse: lastChangePct(kse), kmi: lastChangePct(kmi) });
          setLastUpdated(new Date());
        }
      } catch { 
        /* ignore — fall back to history */ 
      }
    })();
    return () => { alive = false; };
  }, []);

  // Update timestamp if new data prop arrives
  useEffect(() => {
    if (data && data.length > 0) {
      setLastUpdated(new Date());
    }
  }, [data]);

  const stats = useMemo(() => {
    const clean = (data || []).filter(d => d && d.rawDate);

    // TODAY: prefer live numbers (portfolio from the Today's P&L card, indices from
    // the live fetch). Fall back to the most recent history row if live data is missing.
    if (win === '1D') {
      const histPort = clean.length ? cum(clean.slice(-1), 'Portfolio') : null;
      const histKse = clean.length ? cum(clean.slice(-1), 'KSE100') : null;
      const histKmi = clean.length ? cum(clean.slice(-1), 'KMI30') : null;
      const port = portfolioTodayPct ?? histPort;
      const kse = live.kse ?? histKse;
      const kmi = live.kmi ?? histKmi;
      if (port == null && kse == null && kmi == null) return null;
      const p = port ?? 0, k = kse ?? 0, m = kmi ?? 0;
      return { port: p, kse: k, kmi: m, vsKse: p - k, vsKmi: p - m };
    }

    // 1 WEEK / 1 MONTH: compound the daily returns from the generated history.
    const rows = win === '1W' ? clean.slice(-5) : clean;
    if (rows.length === 0) return null;
    const port = cum(rows, 'Portfolio');
    const kse = cum(rows, 'KSE100');
    const kmi = cum(rows, 'KMI30');
    return { port, kse, kmi, vsKse: port - kse, vsKmi: port - kmi };
  }, [data, win, live, portfolioTodayPct]);

  const formatLastUpdated = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  const chip = (active: boolean) => `px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">
            Performance vs Index
          </h3>
          {lastUpdated && (
            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
              Last updated: {formatLastUpdated(lastUpdated)}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['1D', '1W', '1M'] as Win[]).map(w => (
            <button key={w} onClick={() => setWin(w)} className={chip(win === w)}>
              {w === '1M' ? '1 Month' : w === '1W' ? '1 Week' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
          Generate the performance chart below to unlock this comparison.
        </p>
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
          <p className="text-[10px] text-slate-400 mt-3 leading-snug">
            {win === '1D'
              ? 'Live today: your portfolio move vs the latest KSE-100 / KMI-30 change.'
              : 'Compounded daily returns over the selected window (from your generated history, up to ~1 month).'}
          </p>
        </>
      )}
    </div>
  );
};
