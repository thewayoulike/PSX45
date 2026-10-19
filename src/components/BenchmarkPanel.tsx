import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, TrendingDown } from 'lucide-react';
import { todayPK } from '../utils/dates';
import { compoundPerformance, type PerformanceRow } from '../utils/stockPerformance';
import { fetchIndexQuote } from '../services/psxData';

// Each entry: { rawDate, Portfolio, KSE100, KMI30 }  (daily return %)
interface Props {
  data: PerformanceRow[];
  quoteTime?: string | null;
  sessionDate?: string;
  // Live "today" portfolio move (same number as the Today's P&L card). Optional.
  portfolioTodayPct?: number | null;
}

type Win = '1D' | '1W' | '1M';

const spct = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const posNeg = (v: number | null) => v == null ? 'text-slate-500' : (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400');

export const BenchmarkPanel: React.FC<Props> = ({ data, portfolioTodayPct, quoteTime, sessionDate = todayPK() }) => {
  const [win, setWin] = useState<Win>('1M');
  const [live, setLive] = useState<{ kse: number | null; kmi: number | null; fetchedAt: string | null }>({ kse: null, kmi: null, fetchedAt: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [kse, kmi] = await Promise.all([
        fetchIndexQuote('KSE100').catch(() => null), fetchIndexQuote('KMI30').catch(() => null),
      ]);
      if (alive) setLive({ kse: kse?.asOfDate === sessionDate ? kse.changePct : null,
        kmi: kmi?.asOfDate === sessionDate ? kmi.changePct : null, fetchedAt: new Date().toISOString() });
    })();
    return () => { alive = false; };
  }, [quoteTime, sessionDate]);
  const stats = useMemo(() => {
    const clean = (data || []).filter(d => d && d.rawDate);
    const rows = win === '1D' ? clean.filter(d => d.rawDate === sessionDate) : win === '1W' ? clean.slice(-5) : clean;
    const port = win === '1D' && portfolioTodayPct !== undefined ? portfolioTodayPct : compoundPerformance(rows, 'Portfolio');
    const kse = (win === '1D' ? live.kse : null) ?? compoundPerformance(rows, 'KSE100');
    const kmi = (win === '1D' ? live.kmi : null) ?? compoundPerformance(rows, 'KMI30');
    if (port == null && kse == null && kmi == null) return null;
    return { port, kse, kmi, vsKse: port != null && kse != null ? port - kse : null };
  }, [data, win, live, portfolioTodayPct, sessionDate]);
  const lastUpdated = win === '1D' ? live.fetchedAt : data.at(-1)?.fetchedAt;

  const formatLastUpdated = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Karachi',
    }).format(date);
  };

  const chip = (active: boolean) => `px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">
            Performance vs Index
          </h3>
          {lastUpdated && (
            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
              Retrieved: {formatLastUpdated(new Date(lastUpdated))} PKT
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['1D', '1W', '1M'] as Win[]).map(w => (
            <button key={w} onClick={() => setWin(w)} className={chip(win === w)}>
              {w === '1M' ? '1 Month' : w === '1W' ? '1 Week' : 'Latest session'}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
          A comparison needs complete daily prices. Refresh the performance chart to try again.
        </p>
      ) : (
        <div className="flex-1 flex flex-col justify-between min-h-0">
          {/* Headline */}
          {stats.vsKse != null ? <div className={`flex items-center gap-2 mb-4 p-3 rounded-2xl ${stats.vsKse >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
            {stats.vsKse >= 0 ? <Trophy size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <TrendingDown size={18} className="text-rose-500 shrink-0" />}
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {stats.vsKse >= 0 ? 'Beating' : 'Lagging'} KSE-100 by <span className={posNeg(stats.vsKse)}>{Math.abs(stats.vsKse).toFixed(2)} percentage points</span> {win === '1D' ? `for ${sessionDate}` : win === '1W' ? 'this week' : 'this month'}
            </span>
          </div>

          : <p className="mb-4 text-sm text-slate-500">Comparison unavailable: prices are incomplete or a corporate action needs verification.</p>}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your stock P&L</div>
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
              <div className={`text-lg font-display font-black tabular-nums ${posNeg(stats.vsKse)}`}>{stats.vsKse == null ? '—' : `${stats.vsKse >= 0 ? '+' : ''}${stats.vsKse.toFixed(2)} pp`}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-auto pt-3 leading-snug">
            {win === '1D'
              ? 'Today uses the P&L card’s calculation and same-session index changes.'
              : 'Compounded daily stock P&L percentages over available sessions, up to 30 days. A missing return makes the comparison unavailable. Cash, fees and dividends are excluded.'}
          </p>
        </div>
      )}
    </div>
  );
};
