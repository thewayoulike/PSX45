import React from 'react';
import type { EmailSearchPeriod } from '../utils/emailSearch';

const periods: { value: EmailSearchPeriod; label: string }[] = [
  { value: 'all', label: 'All time' }, { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' }, { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' }, { value: 'custom', label: 'Custom' },
];

export function EmailSearchPeriodPicker({ period, startDate, endDate, disabled, onPeriodChange, onStartChange, onEndChange }: {
  period: EmailSearchPeriod; startDate: string; endDate: string; disabled?: boolean;
  onPeriodChange: (period: EmailSearchPeriod) => void; onStartChange: (value: string) => void; onEndChange: (value: string) => void;
}) {
  const inputClass = 'min-w-0 w-full text-xs p-3 rounded-xl border border-rose-200/80 dark:border-rose-700/60 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 outline-none focus:border-rose-400 disabled:opacity-60';
  return <fieldset disabled={disabled} className="min-w-0 mb-4">
    <legend className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-2 ml-1">Email period</legend>
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {periods.map(option => <button key={option.value} type="button" aria-pressed={period === option.value}
        onClick={() => onPeriodChange(option.value)}
        className={`min-h-10 px-2 py-2 text-xs font-bold rounded-lg border transition-colors ${period === option.value
          ? 'bg-rose-600 border-rose-600 text-white'
          : 'bg-white dark:bg-slate-900/50 border-rose-200/80 dark:border-rose-700/60 text-slate-600 dark:text-slate-300 hover:border-rose-400'}`}>
        {option.label}
      </button>)}
    </div>
    {period === 'custom' && <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 mt-3">
      <label className="min-w-0 text-[11px] font-bold text-slate-600 dark:text-slate-300">From
        <input type="date" value={startDate} max={endDate || undefined} onChange={e => onStartChange(e.target.value)} className={`${inputClass} block mt-1`} />
      </label>
      <label className="min-w-0 text-[11px] font-bold text-slate-600 dark:text-slate-300">To
        <input type="date" value={endDate} min={startDate || undefined} onChange={e => onEndChange(e.target.value)} className={`${inputClass} block mt-1`} />
      </label>
    </div>}
    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">{period === 'custom' ? 'Both dates included. ' : period !== 'all' ? 'Through today. ' : ''}Email received dates · Pakistan time.</p>
  </fieldset>;
}
