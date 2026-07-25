import React, { useMemo } from 'react';
import { Transaction, Holding } from '../types';
import { 
  ArrowLeft, 
  TrendingUp, 
  Wallet, 
  Briefcase, 
  History, 
  Coins, 
  BarChart3,
  CheckCircle
} from 'lucide-react';

import PSXChart from './PSXChart';
import { SetAlert } from './SetAlert';

interface TickerProfileProps {
  ticker: string;
  currentPrice: number;
  sector: string;
  transactions: Transaction[];
  holding?: Holding;
  onClose: () => void;
}

export const TickerProfile: React.FC<TickerProfileProps> = ({
  ticker, 
  currentPrice, 
  sector, 
  transactions, 
  holding, 
  onClose
}) => {

  const { stats, realizedStats, sortedTransactionsDesc } = useMemo(() => {
    let totalDividends = 0;
    let dividendTax = 0;
    let totalCashIn = 0;
    let totalCashOut = 0;

    // WAC (Weighted Average Cost) Trackers
    let currentQty = 0;
    let currentWAC = 0; // Average cost per share

    let totalRealizedPnL = 0;
    let totalRealizedCost = 0;
    let totalRealizedRevenue = 0;
    let totalRealizedShares = 0;

    // Safely copy array and sort chronologically (oldest to newest) for WAC math
    const sortedAsc = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    sortedAsc.forEach((t) => {
      const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
      const gross = t.quantity * t.price;

      if (t.type === 'BUY' || t.type === 'TRANSFER_IN') {
        const totalBuyCost = gross + fees;
        totalCashIn += totalBuyCost;

        // Update WAC
        const newQty = currentQty + t.quantity;
        if (newQty > 0) {
          currentWAC = ((currentQty * currentWAC) + totalBuyCost) / newQty;
        }
        currentQty = newQty;

      } else if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') {
        const netProceeds = gross - fees;
        totalCashOut += netProceeds;

        // Calculate Realized PnL using WAC
        const costOfGoodsSold = t.quantity * currentWAC;
        const realizedPnL = netProceeds - costOfGoodsSold;

        totalRealizedCost += costOfGoodsSold;
        totalRealizedRevenue += netProceeds;
        totalRealizedPnL += realizedPnL;
        totalRealizedShares += t.quantity;

        // Reduce holding quantity
        currentQty = Math.max(0, currentQty - t.quantity);
        if (currentQty === 0) currentWAC = 0;

      } else if (t.type === 'DIVIDEND') {
        totalDividends += gross;
        dividendTax += (t.tax || 0);
        const netDiv = gross - (t.tax || 0);
        totalCashOut += netDiv;
      }
    });

    const currentMarketValue = (holding?.quantity || 0) * currentPrice;
    const lifetimeNet = (totalCashOut + currentMarketValue) - totalCashIn;

    // True Weighted Realized ROI
    const realizedROI = totalRealizedCost > 0 ? (totalRealizedPnL / totalRealizedCost) * 100 : 0;
    const realizedAvgBuy = totalRealizedShares > 0 ? totalRealizedCost / totalRealizedShares : 0;
    const realizedAvgSell = totalRealizedShares > 0 ? totalRealizedRevenue / totalRealizedShares : 0;

    return {
      stats: {
        netDividends: totalDividends - dividendTax,
        lifetimeNet,
        totalExtracted: totalCashOut
      },
      realizedStats: {
        pnl: totalRealizedPnL,
        roi: realizedROI,
        avgBuy: realizedAvgBuy,
        avgSell: realizedAvgSell,
        shares: totalRealizedShares
      },
      // Memoized descending sort for the transaction history table
      sortedTransactionsDesc: [...sortedAsc].reverse()
    };
  }, [transactions, holding, currentPrice]);

  const quantity = holding?.quantity || 0;
  const avgPrice = holding?.avgPrice || 0;
  const marketValue = quantity * currentPrice;

  const isLifetimeProfit = stats.lifetimeNet >= 0;
  
  // Unrealized Math
  const unrealizedPL = marketValue - (quantity * avgPrice);
  const unrealizedPLPercent = (quantity * avgPrice) > 0 ? (unrealizedPL / (quantity * avgPrice)) * 100 : 0;
  const isUnrealizedProfit = unrealizedPL >= 0;

  // Realized Math
  const isRealizedProfit = realizedStats.pnl >= 0;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 overflow-y-auto animate-in slide-in-from-right duration-300">

      {/* HEADER */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose} 
            aria-label="Close Profile"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
              {ticker}
              <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 uppercase tracking-wider hidden sm:block">
                {sector}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6 text-right">
          {quantity > 0 && (
            <div className="hidden sm:block">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Current Price</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                Rs. {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
          <div className={`px-4 py-2 rounded-xl border ${isLifetimeProfit ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-800'}`}>
            <div className={`text-xs font-bold uppercase tracking-wider ${isLifetimeProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>Lifetime Net</div>
            <div className={`text-xl font-black ${isLifetimeProfit ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {isLifetimeProfit ? '+' : ''}{stats.lifetimeNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">

        {/* LIVE MARKET CHART */}
        <div className="bg-white dark:bg-slate-900 p-1 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <BarChart3 size={20} className="text-emerald-600 dark:text-emerald-400" />
              Live Market Chart
            </h3>
          </div>
          <div className="w-full">
            <PSXChart symbol={ticker} height={600} />
          </div>
        </div>

        {/* PRICE ALERT WIDGET */}
        <SetAlert ticker={ticker} currentPrice={currentPrice} />

        {/* STAT CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. UNREALIZED HOLDING */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Wallet size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Briefcase size={18} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Unrealized (Open)</h3>
                </div>
              </div>

              {quantity > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-sm text-slate-500 font-medium mb-1">Open Shares</div>
                      <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                        {quantity.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isUnrealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isUnrealizedProfit ? '+' : ''}{unrealizedPL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-sm font-bold ${isUnrealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>
                        {isUnrealizedProfit ? '+' : ''}{unrealizedPLPercent.toFixed(2)}% ROI
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider">Avg Buy</div>
                      <div className="font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider">Current</div>
                      <div className="font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-slate-400 font-medium italic flex items-center gap-2">
                  <History size={20} /> No Open Position
                </div>
              )}
            </div>
          </div>

          {/* 2. REALIZED PERFORMANCE */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className={`p-2 rounded-lg ${realizedStats.shares > 0 ? (isRealizedProfit ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400') : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <CheckCircle size={18} />
                </div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Realized (Closed)</h3>
              </div>

              {realizedStats.shares > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-sm text-slate-500 font-medium mb-1">Shares Sold</div>
                      <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                        {realizedStats.shares.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isRealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isRealizedProfit ? '+' : ''}{realizedStats.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-sm font-bold ${isRealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>
                        {isRealizedProfit ? '+' : ''}{realizedStats.roi.toFixed(2)}% ROI
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider">W. Avg Buy</div>
                      <div className="font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {realizedStats.avgBuy.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider">W. Avg Sell</div>
                      <div className="font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {realizedStats.avgSell.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-slate-400 font-medium italic flex items-center gap-2">
                  <History size={20} /> No Sales Yet
                </div>
              )}
            </div>
          </div>

          {/* 3. PASSIVE INCOME */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Coins size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><Coins size={18} /></div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Passive Income</h3>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  +{stats.netDividends.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-slate-400">Net Dividends Collected</div>
              </div>
            </div>
          </div>

        </div>

        {/* TRANSACTION HISTORY TABLE */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <History size={20} className="text-slate-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">Transaction History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Broker</th>
                  <th className="px-6 py-4 text-right">Qty</th>
                  <th className="px-6 py-4 text-right">Price</th>
                  <th className="px-6 py-4 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedTransactionsDesc.map((t, index) => {
                  const total = t.quantity * t.price;
                  const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
                  let net = 0;
                  if (t.type === 'BUY') net = -(total + fees);
                  else if (t.type === 'SELL') net = total - fees;
                  else if (t.type === 'DIVIDEND') net = total - (t.tax || 0);

                  return (
                    <tr key={t.id || index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{t.date}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                          t.type === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
                          t.type === 'SELL' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' :
                          t.type === 'DIVIDEND' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800' : 'bg-slate-100 dark:bg-slate-800'
                        }`}>{t.type}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">{t.broker || '-'}</td>
                      <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-300 font-medium">{t.quantity.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-mono">{t.price.toLocaleString()}</td>
                      <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
