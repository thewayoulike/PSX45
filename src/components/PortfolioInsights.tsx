import React, { useMemo } from 'react';
import { Holding, PortfolioStats } from '../types';
import { TrendingUp, PieChart, Activity, Coins } from 'lucide-react';

interface PortfolioInsightsProps {
  holdings: Holding[];
  stats: PortfolioStats;
}

export const PortfolioInsights: React.FC<PortfolioInsightsProps> = ({ holdings, stats }) => {
  const insights = useMemo(() => {
    if (!holdings || holdings.length === 0) return null;

    // 1. Best Performer
    const bestHolding = [...holdings].sort((a, b) => {
      const aReturn = a.avgPrice > 0 ? (a.currentPrice - a.avgPrice) / a.avgPrice : 0;
      const bReturn = b.avgPrice > 0 ? (b.currentPrice - b.avgPrice) / b.avgPrice : 0;
      return bReturn - aReturn;
    })[0];
    
    const bestReturnPct = bestHolding && bestHolding.avgPrice > 0 
        ? ((bestHolding.currentPrice - bestHolding.avgPrice) / bestHolding.avgPrice) * 100 
        : 0;
    const bestReturnAbs = bestHolding ? (bestHolding.currentPrice - bestHolding.avgPrice) * bestHolding.quantity : 0;

    // 2. Highest Allocation
    const topAllocation = [...holdings].sort((a, b) => {
      return (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity);
    })[0];
    
    const allocationPct = topAllocation && stats.totalValue > 0 
        ? ((topAllocation.currentPrice * topAllocation.quantity) / stats.totalValue) * 100 
        : 0;

    // 3. Dividend Contribution
    // Calculate total absolute return (Unrealized + Realized + Dividends)
    const totalAbsoluteReturn = stats.unrealizedPL + stats.netRealizedPL + stats.totalDividends;
    const divContributionPct = totalAbsoluteReturn > 0 
        ? (stats.totalDividends / totalAbsoluteReturn) * 100 
        : 0;

    return {
      bestHolding,
      bestReturnPct,
      bestReturnAbs,
      topAllocation,
      allocationPct,
      divContributionPct,
      totalAbsoluteReturn
    };
  }, [holdings, stats]);

  if (!insights) return null; // Hide if no data

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">💡</span>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Insights</h3>
      </div>

      <div className="flex flex-col space-y-4">
        
        {/* Insight 1: Best Performer */}
        {insights.bestHolding && (
          <div className="flex items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-800 dark:text-slate-100">{insights.bestHolding.ticker}</span> is your best performer this month
              </p>
              <p className={`text-sm font-bold mt-0.5 ${insights.bestReturnAbs >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {insights.bestReturnAbs >= 0 ? '+' : ''}{insights.bestReturnAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                <span className="font-medium ml-1">({insights.bestReturnPct.toFixed(2)}%)</span>
              </p>
            </div>
          </div>
        )}

        {/* Insight 2: Allocation */}
        {insights.topAllocation && (
          <div className="flex items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <PieChart size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                <span className="font-bold text-amber-600 dark:text-amber-500">{insights.topAllocation.ticker}</span> contributes <span className="font-bold text-slate-800 dark:text-slate-100">{insights.allocationPct.toFixed(2)}%</span> of your portfolio value
              </p>
            </div>
          </div>
        )}

        {/* Insight 3: Daily Movement */}
        <div className="flex items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Activity size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
              Your portfolio {stats.dailyPL >= 0 ? 'gained' : 'lost'} <span className="font-bold text-slate-800 dark:text-slate-100">{Math.abs(stats.dailyPLPercent).toFixed(2)}%</span> today
            </p>
          </div>
        </div>

        {/* Insight 4: Dividends */}
        {stats.totalDividends > 0 && (
          <div className="flex items-start gap-4 pb-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Coins size={16} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                Dividend income represents <span className="font-bold text-slate-800 dark:text-slate-100">{insights.divContributionPct.toFixed(2)}%</span> of your total returns
              </p>
            </div>
          </div>
        )}

      </div>

      <button className="w-full mt-6 py-2.5 border border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold rounded-xl transition-colors text-sm">
        View Full Report
      </button>
    </div>
  );
};
