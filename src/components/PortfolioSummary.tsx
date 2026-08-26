import React, { useMemo } from 'react';
import { Holding, PortfolioStats, RealizedTrade } from '../types';
import { TrendingUp, TrendingDown, Star, PieChart, ShieldCheck, Wallet } from 'lucide-react';
import { formatFundShortLabel } from '../utils/fundDisplay';

interface Props {
  holdings: Holding[];
  realizedTrades: RealizedTrade[];
  stats: PortfolioStats;
  displayNames?: Record<string, string>;
}

const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const MIN_COST = 500;

const Cell: React.FC<{
  label: string; icon: React.ReactNode; wrap: string; value: React.ReactNode; valueClass?: string; sub?: React.ReactNode;
}> = ({ label, icon, wrap, value, valueClass, sub }) => (
  <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50 hover:shadow-sm transition-all">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${wrap}`}>{icon}</span>
    </div>
    <div className={`text-lg font-display font-black tracking-tight leading-none ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>{value}</div>
    {sub && <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 leading-tight">{sub}</div>}
  </div>
);

export const PortfolioSummary: React.FC<Props> = ({ holdings, realizedTrades, stats, displayNames = {} }) => {
  const s = useMemo(() => {
    // best / worst across active + sold
    const agg: Record<string, { profit: number; cost: number }> = {};
    realizedTrades.filter(t => t.ticker && t.ticker !== 'PREV-PNL').forEach(t => {
      const a = (agg[t.ticker] ||= { profit: 0, cost: 0 }); a.profit += t.profit; a.cost += t.buyAvg * t.quantity;
    });
    holdings.forEach(h => { const a = (agg[h.ticker] ||= { profit: 0, cost: 0 }); a.profit += (h.currentPrice - h.avgPrice) * h.quantity; a.cost += h.avgPrice * h.quantity; });
    let best: { t: string; ret: number; profit: number } | null = null;
    let worst: { t: string; ret: number; profit: number } | null = null;
    Object.entries(agg).forEach(([t, d]) => {
      if (d.cost < MIN_COST) return;
      const ret = (d.profit / d.cost) * 100;
      if (!best || ret > best.ret) best = { t, ret, profit: d.profit };
      if (!worst || ret < worst.ret) worst = { t, ret, profit: d.profit };
    });

    // top holding by value
    const valued = holdings.map(h => ({ t: h.ticker, v: h.currentPrice * h.quantity, sector: h.sector || 'Other' })).sort((a, b) => b.v - a.v);
    const topHolding = valued[0];
    const topHoldingPct = topHolding && stats.totalValue > 0 ? (topHolding.v / stats.totalValue) * 100 : 0;

    // top sector
    const sectorMap: Record<string, number> = {};
    valued.forEach(v => { sectorMap[v.sector] = (sectorMap[v.sector] || 0) + v.v; });
    const sortedSectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
    const topSector = sortedSectors[0];
    const topSectorPct = topSector && stats.totalValue > 0 ? (topSector[1] / stats.totalValue) * 100 : 0;

    // diversification label from top-3 concentration
    const top3 = valued.slice(0, 3).reduce((a, x) => a + x.v, 0);
    const top3Pct = stats.totalValue > 0 ? (top3 / stats.totalValue) * 100 : 0;
    const div = top3Pct >= 65 ? { label: 'Concentrated', cls: 'text-rose-500', wrap: 'bg-rose-50 dark:bg-rose-500/20 text-rose-500' }
      : top3Pct >= 45 ? { label: 'Moderate', cls: 'text-amber-500', wrap: 'bg-amber-50 dark:bg-amber-500/20 text-amber-500' }
      : { label: 'Well spread', cls: 'text-emerald-600 dark:text-emerald-400', wrap: 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-500' };

    const netWorth = stats.totalValue + stats.freeCash;
    const cashPct = netWorth > 0 ? (stats.freeCash / netWorth) * 100 : 0;

    return { best, worst, topHolding, topHoldingPct, topSector, topSectorPct, holdingsCount: holdings.length, div, cashPct };
  }, [holdings, realizedTrades, stats]);

  if (holdings.length === 0 && realizedTrades.length === 0) return null;

  const name = (t: string) => formatFundShortLabel(t, displayNames, 28);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <h3 className="text-sm font-display font-black text-slate-900 dark:text-white mb-4">Portfolio Summary</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Cell label="Best Performer" icon={<TrendingUp size={15} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-500/20"
          value={s.best ? name(s.best.t) : '—'} valueClass="text-slate-900 dark:text-white text-base"
          sub={s.best ? <span className="text-emerald-600 dark:text-emerald-400">+{rs0(s.best.profit)} ({s.best.ret >= 0 ? '+' : ''}{s.best.ret.toFixed(2)}%)</span> : 'No trades yet'} />

        <Cell label="Worst Performer" icon={<TrendingDown size={15} className="text-rose-500" />} wrap="bg-rose-50 dark:bg-rose-500/20"
          value={s.worst ? name(s.worst.t) : '—'} valueClass="text-slate-900 dark:text-white text-base"
          sub={s.worst ? <span className="text-rose-500">{rs0(s.worst.profit)} ({s.worst.ret.toFixed(2)}%)</span> : 'No trades yet'} />

        <Cell label="Top Holding" icon={<Star size={15} className="text-blue-600 dark:text-blue-400" />} wrap="bg-blue-50 dark:bg-blue-500/20"
          value={s.topHolding ? name(s.topHolding.t) : '—'} valueClass="text-slate-900 dark:text-white text-base"
          sub={s.topHolding ? `${s.topHoldingPct.toFixed(2)}% of portfolio` : '—'} />

        <Cell label="Top Sector" icon={<PieChart size={15} className="text-purple-600 dark:text-purple-400" />} wrap="bg-purple-50 dark:bg-purple-500/20"
          value={s.topSector ? s.topSector[0] : '—'} valueClass="text-purple-600 dark:text-purple-400"
          sub={s.topSector ? `${s.topSectorPct.toFixed(2)}% of portfolio` : '—'} />

        <Cell label="Diversification" icon={<ShieldCheck size={15} className={s.div.cls} />} wrap={s.div.wrap}
          value={`${s.holdingsCount} Holdings`} valueClass="text-slate-900 dark:text-white"
          sub={<span className={s.div.cls}>{s.div.label}</span>} />

        <Cell label="Cash Allocation" icon={<Wallet size={15} className="text-teal-600 dark:text-teal-400" />} wrap="bg-teal-50 dark:bg-teal-500/20"
          value={`${s.cashPct.toFixed(2)}%`} valueClass="text-slate-900 dark:text-white"
          sub={rs0(stats.freeCash)} />
      </div>
    </div>
  );
};
