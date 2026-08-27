import React, { useMemo } from 'react';
import { Transaction, Holding } from '../types';
import { 
  ArrowLeft, 
  TrendingUp, 
  Wallet, 
  Briefcase, 
  History, 
  Coins, 
  CheckCircle
} from 'lucide-react';

import { StockChart } from './StockChart';
import { SetAlert } from './SetAlert';

// --- HYBRID FALLBACK: Static Lists ---
const FALLBACK_KMI30 = new Set([
  'ENGRO', 'FFC', 'HUBC', 'LUCK', 'MARI', 'MEBL', 'OGDC', 'POL', 'PPL', 'PSO', 'SYS', 'TRG', 
  'CHCC', 'DGKC', 'FCCL', 'INIL', 'ISL', 'PIOC', 'PRL', 'SEARL', 'AICL', 'ATLH', 'DAWH', 
  'EPCL', 'GLAXO', 'MTL', 'NML', 'PKGS', 'SAZEW', 'THALL', 'AVN', 'GWLC', 'NATF', 'PSMC', 'EFERT'
]);

const FALLBACK_KSE100 = new Set([
  ...Array.from(FALLBACK_KMI30), 
  'UBL', 'HBL', 'MCB', 'BAHL', 'FABL', 'BAFL', 'BOP', 'SCBPL', 'KEL', 'FFBL', 'FATIMA', 
  'INDU', 'HCAR', 'PAEL', 'AGP', 'MUREB', 'NESTLE', 'COLG', 'BATA', 'IGIHL', 'SHFA', 
  'FEROZ', 'GTYR', 'LOTCHEM', 'NRL', 'SNGP', 'SSGC', 'NBP', 'AKBL', 'SNBL', 'HMB', 
  'EFOODS', 'GATM', 'HINO', 'KAPCO', 'NCPL', 'NPL', 'PKPEL', 'RMPL', 'SHEL', 'SML', 
  'TGL', 'GGL', 'GHGL', 'ASTL', 'ASL', 'CSAP', 'MUGHAL', 'AGHA', 'AMPL', 'FLYNG', 
  'NCL', 'STJT', 'FML', 'GADT', 'ILP', 'KTML', 'CAPP', 'TATM', 'CPHL', 'DSIL'
]);

interface TickerProfileProps {
  ticker: string;
  currentPrice: number;
  sector: string;
  transactions: Transaction[];
  holding?: Holding;
  listedInMap?: Record<string, string>; // Pass the dynamic tags here
  onClose: () => void;
  canSaveAlerts?: boolean;
}

export const TickerProfile: React.FC<TickerProfileProps> = ({
  ticker, 
  currentPrice, 
  sector, 
  transactions, 
  holding, 
  listedInMap = {},
  onClose,
  canSaveAlerts
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
        const netDiv = gross - (t.tax || 0) - (t.otherFees || 0);
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

  // --- DYNAMIC TAG GENERATION ---
  let tags: string[] = [];
  const rawListedIn = listedInMap?.[ticker] || "";
  if (rawListedIn) {
      tags = rawListedIn.split(',').map(t => t.trim()).filter(t => t);
  } else {
      const cleanTicker = ticker.toUpperCase();
      if (FALLBACK_KMI30.has(cleanTicker)) tags.push('KMI30');
      if (FALLBACK_KSE100.has(cleanTicker)) tags.push('KSE100');
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-right duration-300">

      {/* HEADER */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/60 dark:border-slate-800/60 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-start gap-4">
          <button 
            onClick={onClose} 
            aria-label="Close Profile"
            className="p-2.5 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-600 dark:text-slate-300 shadow-sm shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col">
            <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              {ticker}
            </h1>
            
            <div className="flex flex-col gap-2 mt-1.5">
                <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60 uppercase tracking-widest hidden sm:inline-block w-fit shadow-sm">
                  {sector}
                </span>
                
                {/* --- DYNAMIC TAGS --- */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag, i) => {
                            let colorClass = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                            if (tag.includes('KMI')) {
                                colorClass = "bg-purple-50 text-purple-600 border-purple-200/60 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20";
                            } else if (tag.includes('KSE')) {
                                colorClass = "bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
                            }
                            return (
                                <span 
                                    key={`${tag}-${i}`} 
                                    className={`text-[9px] leading-none px-2 py-1 rounded-md border font-bold uppercase tracking-wider shadow-sm ${colorClass}`}
                                >
                                    {tag}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-right">
          {quantity > 0 && (
            <div className="hidden sm:block">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current Price</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                Rs. {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
          <div className={`px-4 py-2.5 rounded-xl border shadow-sm ${isLifetimeProfit ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest ${isLifetimeProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>Lifetime Net</div>
            <div className={`text-xl font-display font-black tabular-nums ${isLifetimeProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isLifetimeProfit ? '+' : ''}{stats.lifetimeNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 md:py-8 space-y-8">

        {/* OHLCV CANDLE / PRICE CHART */}
        <StockChart symbol={ticker} />

        {/* PRICE ALERT WIDGET */}
        <SetAlert ticker={ticker} currentPrice={currentPrice} canSaveAlerts={canSaveAlerts} />

        {/* STAT CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          
          {/* 1. UNREALIZED HOLDING */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Wallet size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm">
                    <Briefcase size={18} />
                  </div>
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Unrealized (Open)</h3>
                </div>
              </div>

              {quantity > 0 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Open Shares</div>
                      <div className="text-3xl font-display font-black text-slate-900 dark:text-white tabular-nums">
                        {quantity.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-display font-black tabular-nums ${isUnrealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isUnrealizedProfit ? '+' : ''}{unrealizedPL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${isUnrealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>
                        {isUnrealizedProfit ? '+' : ''}{unrealizedPLPercent.toFixed(2)}% ROI
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Avg Buy</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-slate-400 font-medium italic flex items-center justify-center gap-2">
                  <History size={20} /> No Open Position
                </div>
              )}
            </div>
          </div>

          {/* 2. REALIZED PERFORMANCE */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm ${realizedStats.shares > 0 ? (isRealizedProfit ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20') : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                  <CheckCircle size={18} />
                </div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Realized (Closed)</h3>
              </div>

              {realizedStats.shares > 0 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Shares Sold</div>
                      <div className="text-3xl font-display font-black text-slate-900 dark:text-white tabular-nums">
                        {realizedStats.shares.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-display font-black tabular-nums ${isRealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isRealizedProfit ? '+' : ''}{realizedStats.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${isRealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>
                        {isRealizedProfit ? '+' : ''}{realizedStats.roi.toFixed(2)}% ROI
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">W. Avg Buy</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {realizedStats.avgBuy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">W. Avg Sell</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {realizedStats.avgSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-slate-400 font-medium italic flex items-center justify-center gap-2">
                  <History size={20} /> No Sales Yet
                </div>
              )}
            </div>
          </div>

          {/* 3. PASSIVE INCOME */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Coins size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                  <Coins size={18} />
                </div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Passive Income</h3>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                  +{stats.netDividends.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Net Dividends Collected</div>
              </div>
            </div>
          </div>

        </div>

        {/* TRANSACTION HISTORY TABLE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark">
          <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3 bg-white dark:bg-slate-900">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
              <History size={20} />
            </div>
            <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Transaction History</h3>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[900px] border-collapse">
              <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-widest border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Broker</th>
                  <th className="px-6 py-3.5 text-right">Qty</th>
                  <th className="px-6 py-3.5 text-right">Price</th>
                  <th className="px-6 py-3.5 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {sortedTransactionsDesc.map((t, index) => {
                  const total = t.quantity * t.price;
                  const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
                  let net = 0;
                  if (t.type === 'BUY') net = -(total + fees);
                  else if (t.type === 'SELL') net = total - fees;
                  else if (t.type === 'DIVIDEND') net = total - (t.tax || 0) - (t.otherFees || 0);

                  return (
                    <tr key={t.id || index} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group">
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs tabular-nums">{t.date}</td>
                      <td className="px-6 py-3.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${
                          t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                          t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                          t.type === 'DIVIDEND' ? 'bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60'
                        }`}>{t.type}</span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 text-[11px] font-bold tracking-wider uppercase">{t.broker || '-'}</td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{t.quantity.toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-400 font-mono tabular-nums">{t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`px-6 py-3.5 text-right font-bold font-mono tabular-nums ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
