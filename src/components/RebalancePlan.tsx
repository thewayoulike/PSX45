import React, { useEffect, useMemo, useState } from 'react';
import { CASH_TARGET, rebalanceGaps } from '../utils/rebalancePlan';
import type { RebalanceTarget } from '../types';

const rs = (n: number) => `Rs. ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const percentsFrom = (
  rows: { ticker: string }[],
  saved: { ticker: string; percent: number }[],
) => {
  const next: Record<string, string> = {};
  rows.forEach(row => {
    const savedPercent = saved.find(target => target.ticker === row.ticker)?.percent;
    next[row.ticker] = savedPercent == null ? '' : String(savedPercent);
  });
  return next;
};

export const RebalancePlanCard: React.FC<{
  positions: { ticker: string; name: string; value: number }[];
  cash: number;
  saved: RebalanceTarget[];
  onSave: (targets: RebalanceTarget[]) => void;
}> = ({ positions, cash, saved, onSave }) => {
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => {
    const list = positions.map(position => ({ ticker: position.ticker, name: position.name }));
    if (!list.some(row => row.ticker === CASH_TARGET)) list.push({ ticker: CASH_TARGET, name: 'Cash' });
    return list;
  }, [positions]);

  const savedKey = saved.map(target => `${target.ticker}:${target.percent}`).join('|');
  const rowKey = rows.map(row => row.ticker).join('|');
  const [percents, setPercents] = useState<Record<string, string>>(() => percentsFrom(rows, saved));

  useEffect(() => {
    setPercents(percentsFrom(rows, saved));
  }, [rowKey, savedKey]);

  const targets = rows.map(row => ({ ticker: row.ticker, percent: Number(percents[row.ticker] || 0) }));
  const plan = rebalanceGaps(
    positions.map(position => ({ ticker: position.ticker, value: position.value })),
    cash,
    targets,
  );
  const sum = targets.reduce((total, target) => total + target.percent, 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan only</div>
          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">Rebalance plan</h3>
        </div>
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set a target weight for each holding and for cash. They must add up to 100. This plan does not place a trade. You still enter any buy or sell yourself, with the real price and charges.
          </p>
          {rows.map(row => {
            const gap = plan.rows.find(item => item.ticker === row.ticker);
            const name = row.ticker === CASH_TARGET ? 'Cash' : row.name;
            return (
              <div key={row.ticker} className="grid grid-cols-[1fr_88px_1fr] gap-3 items-center">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{name}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">Now {gap ? gap.currentPercent.toFixed(1) : '0.0'}%</div>
                </div>
                <input
                  aria-label={`${name} target percent`}
                  value={percents[row.ticker] ?? ''}
                  onChange={e => setPercents(prev => ({ ...prev, [row.ticker]: e.target.value }))}
                  type="number"
                  min="0"
                  step="any"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-sm font-bold tabular-nums text-right"
                />
                <div className="text-xs font-bold tabular-nums text-right text-slate-600 dark:text-slate-300">
                  {plan.ok && gap
                    ? (Math.abs(gap.gapRupees) < 1 ? 'On target' : gap.gapRupees > 0 ? `Short ${rs(gap.gapRupees)}` : `Over ${rs(gap.gapRupees)}`)
                    : '—'}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className={`text-xs font-bold ${plan.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {plan.ok ? 'Targets add up to 100%' : `Targets add up to ${sum.toFixed(1)}%, not 100%`}
            </span>
            <button
              type="button"
              disabled={!plan.ok}
              onClick={() => onSave(targets.filter(target => target.percent > 0))}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              Save plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
