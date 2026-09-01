import React, { useMemo } from 'react';
import { Holding, PortfolioStats, PortfolioType } from '../types';
import { isFundTicker } from '../utils/fundId';
import { formatFundShortLabel } from '../utils/fundDisplay';

interface Props {
  holdings: Holding[];
  stats: PortfolioStats;
  onTickerClick?: (ticker: string) => void;
  onViewAll?: () => void;
  count?: number;
  displayNames?: Record<string, string>;
  portfolioType?: PortfolioType;
}

const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const TopHoldings: React.FC<Props> = ({ holdings, stats, onTickerClick, onViewAll, count = 5, displayNames = {}, portfolioType = 'PSX' }) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const label = (ticker: string) => formatFundShortLabel(ticker, displayNames, 48);
  const data = useMemo(() => {
    const total = stats.totalValue || holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0) || 1;
    const valued = holdings
      .map(h => ({ ticker: h.ticker, value: h.currentPrice * h.quantity }))
      .sort((a, b) => b.value - a.value);
    const rows = valued.slice(0, count).map(v => ({ ...v, weight: (v.value / total) * 100 }));
    const top3 = (valued.slice(0, 3).reduce((s, v) => s + v.value, 0) / total) * 100;
    const top5 = (valued.slice(0, 5).reduce((s, v) => s + v.value, 0) / total) * 100;
    const conc = top3 >= 60 ? { label: 'High', cls: 'text-rose-500' } : top3 >= 40 ? { label: 'Moderate', cls: 'text-amber-500' } : { label: 'Low', cls: 'text-emerald-600 dark:text-emerald-400' };
    return { rows, top3, top5, conc, maxWeight: rows[0]?.weight || 1 };
  }, [holdings, stats.totalValue, count]);

  if (holdings.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">{isFund ? 'Top Funds' : 'Top Holdings'}</h3>
        {onViewAll && <button onClick={onViewAll} className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">View All</button>}
      </div>

      <div className="grid grid-cols-[1fr_auto_90px] gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 pb-2 border-b border-slate-100 dark:border-slate-800">
        <span>Holding</span><span className="text-right">Value</span><span className="text-right">Weight</span>
      </div>

      <div className="divide-y divide-slate-50 dark:divide-slate-800/60 flex-1 flex flex-col justify-evenly min-h-0">
        {data.rows.map(r => (
          <div key={r.ticker} className="grid grid-cols-[1fr_auto_90px] items-center gap-2 py-2.5">
            <button onClick={() => !isFundTicker(r.ticker) && onTickerClick?.(r.ticker)} className={`text-left font-display font-black text-slate-800 dark:text-white text-sm truncate ${!isFundTicker(r.ticker) && onTickerClick ? 'hover:text-emerald-600 dark:hover:text-emerald-400' : ''} transition-colors`}>{label(r.ticker)}</button>
            <span className="text-right text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{rs0(r.value)}</span>
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums w-12 text-right">{r.weight.toFixed(2)}%</span>
              <div className="w-8 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (r.weight / data.maxWeight) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50 text-center">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Top 3 Holdings</div>
          <div className="text-lg font-display font-black text-slate-900 dark:text-white tabular-nums">{data.top3.toFixed(2)}%</div>
        </div>
        <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50 text-center">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Top 5 Holdings</div>
          <div className="text-lg font-display font-black text-slate-900 dark:text-white tabular-nums">{data.top5.toFixed(2)}%</div>
        </div>
        <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-700/50 text-center">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Concentration</div>
          <div className={`text-lg font-display font-black ${data.conc.cls}`}>{data.conc.label}</div>
        </div>
      </div>
    </div>
  );
};
