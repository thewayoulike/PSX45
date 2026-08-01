import React, { useMemo } from 'react';
import { FoundDividend } from '../types';
import { Coins, CalendarClock } from 'lucide-react';

interface Props {
  dividends: FoundDividend[];   // e.g. scannerState[currentPortfolioId]
  days?: number;                // window, default 30
  onOpenScanner?: () => void;
}

const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const rs2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const UpcomingDividends: React.FC<Props> = ({ dividends, days = 30, onOpenScanner }) => {
  const { rows, totalExpected } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today.getTime() + days * 864e5);

    const upcoming = (dividends || [])
      .filter(d => d.exDate)
      .map(d => {
        const ex = new Date(d.exDate);
        const daysTo = Math.ceil((ex.getTime() - today.getTime()) / 864e5);
        const expected = (d.amount || 0) * (d.eligibleQty || 0);
        return { ...d, ex, daysTo, expected };
      })
      .filter(d => !isNaN(d.ex.getTime()) && d.daysTo >= 0 && d.daysTo <= days)
      .sort((a, b) => a.ex.getTime() - b.ex.getTime());

    return { rows: upcoming, totalExpected: upcoming.reduce((s, d) => s + d.expected, 0) };
  }, [dividends, days]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <CalendarClock size={16} className="text-indigo-500" /> Upcoming Dividends
        </h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Next {days}d</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <Coins size={28} className="text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No payouts in the next {days} days.</p>
          {onOpenScanner && <button onClick={onOpenScanner} className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Run dividend scanner</button>}
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-50 dark:divide-slate-800/60 flex-1">
            {rows.map((d, i) => (
              <div key={`${d.ticker}-${i}`} className="flex items-center gap-3 py-2.5">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{d.ticker}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">Ex-date {d.ex.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · in {d.daysTo}d · {d.type || 'Cash'}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{rs0(d.expected)}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">Rs. {rs2(d.amount || 0)}/sh × {(d.eligibleQty || 0).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Expected income</span>
            <span className="text-base font-display font-black text-emerald-600 dark:text-emerald-400 tabular-nums">+{rs0(totalExpected)}</span>
          </div>
        </>
      )}
    </div>
  );
};
