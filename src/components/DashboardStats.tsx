import React from 'react';
import { PortfolioStats } from '../types';
import { Card } from './ui/Card';
import { DollarSign, Briefcase, CheckCircle2, Activity, Coins, Receipt, Building2, FileText, PiggyBank, Wallet, Scale, TrendingUp, AlertTriangle, TrendingDown, Percent, BarChart3, History, Info, RefreshCcw } from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
  lastUpdated?: string | null; 
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, lastUpdated }) => {
  const isUnrealizedProfitable = stats.unrealizedPL >= 0;
  const isRealizedProfitable = stats.netRealizedPL >= 0; 
  const isRoiPositive = stats.roi >= 0;
  const isMwrrPositive = stats.mwrr >= 0;
  
  const isDailyProfitable = stats.dailyPL >= 0;

  // Calculate Dividend Yield (Net Income / Cost)
  const dividendYield = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;
  
  // Calculate Gross Dividends for display
  const grossDividends = stats.totalDividends + stats.totalDividendTax;

  const totalNetWorth = stats.totalValue + stats.freeCash;
  const isCapitalEroded = totalNetWorth < stats.netPrincipal;
  const erosionAmount = stats.netPrincipal - totalNetWorth;
  const erosionPercent = stats.netPrincipal > 0 ? Math.min((erosionAmount / stats.netPrincipal) * 100, 100) : 0;
  const isSevereLoss = erosionPercent > 20; 

  const totalReturnPercent = stats.netPrincipal > 0 
      ? ((totalNetWorth - stats.netPrincipal) / stats.netPrincipal) * 100 
      : 0;
  const isTotalReturnPositive = totalReturnPercent >= 0;

  // --- NEW: Calculate ROI Excluding Dividends ---
  let roiExcDiv = 0;
  if (stats.peakNetPrincipal > 0) {
      const totalProfitValue = (stats.roi / 100) * stats.peakNetPrincipal;
      const profitExcDiv = totalProfitValue - stats.totalDividends;
      roiExcDiv = (profitExcDiv / stats.peakNetPrincipal) * 100;
  }
  const isRoiExcPositive = roiExcDiv >= 0;
  // ----------------------------------------------

  const formatCurrency = (val: number) => 
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const formatTime = (isoString: string) => {
      return new Date(isoString).toLocaleString('en-US', { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
  };

  const TOP_SECTION_CLASS = "min-h-[3.5rem] flex flex-col justify-center"; 

  const getMwrrTooltip = () => {
      if (stats.mwrr <= -99) return "Why -100%? You suffered a loss almost immediately after depositing. Since MWRR is an annualized metric (XIRR), it projects this rate of loss over a full year, resulting in a total write-off projection.";
      if (stats.mwrr >= 500) return "Why so high? You made a profit very quickly after depositing. MWRR annualizes this short-term gain, projecting it as if it continued for a full year.";
      return "Money-Weighted Rate of Return (XIRR): Calculates your personal performance by weighing your returns against the timing and size of your deposits and withdrawals.";
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4 mb-6 md:mb-10">
        
        {/* ROW 1: Key Performance & Capital */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
           {/* Portfolio MWRR */}
           <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5 relative">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <TrendingUp className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Portfolio MWRR
                    </h3>
                    <div className="absolute top-0 right-0 -mt-2 -mr-2">
                        <div className="text-slate-300 hover:text-indigo-500 cursor-help transition-colors p-1" title={getMwrrTooltip()}>
                            <Info size={14} />
                        </div>
                    </div>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isMwrrPositive ? 'text-indigo-600' : 'text-rose-600'}`}>
                        {isMwrrPositive ? '+' : ''}{stats.mwrr.toFixed(2)}%
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Money-Weighted Return</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isMwrrPositive ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* ROI (Inc & Exc Dividends) */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Percent className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        ROI
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="flex flex-col gap-1 w-full">
                        {/* Including Dividends (Main) */}
                        <div className="flex items-baseline justify-between w-full">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Inc. Div</span>
                            <span className={`text-lg md:text-xl font-bold tracking-tight ${isRoiPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isRoiPositive ? '+' : ''}{stats.roi.toFixed(2)}%
                            </span>
                        </div>
                        {/* Excluding Dividends (Secondary) */}
                        <div className="flex items-baseline justify-between w-full">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Exc. Div</span>
                            <span className={`text-sm md:text-base font-bold tracking-tight ${isRoiExcPositive ? 'text-emerald-600/80' : 'text-rose-600/80'}`}>
                                {isRoiExcPositive ? '+' : ''}{roiExcDiv.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full ${isRoiPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Total Assets */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Briefcase className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Total Assets
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="w-full">
                        <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-baseline gap-0.5 flex-wrap">
                            <span>Rs. {formatCurrency(totalNetWorth)}</span>
                        </div>
                        {(isSevereLoss || isCapitalEroded) && (
                            <div className="flex items-center gap-2 mt-1">
                                {isSevereLoss ? (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[9px] font-bold border border-rose-200 animate-pulse">
                                        <AlertTriangle size={10} />
                                        <span>Risk: -{erosionPercent.toFixed(1)}%</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-bold border border-rose-200">
                                        <TrendingDown size={10} />
                                        <span>Below Principal</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isSevereLoss && !isCapitalEroded && ( <div className="h-[18px]"></div> )}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Capital Status</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        {!isCapitalEroded ? (
                            <div className="h-full bg-emerald-500 w-full rounded-full"></div>
                        ) : (
                            <>
                                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${100 - erosionPercent}%` }} />
                                <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${erosionPercent}%` }} />
                            </>
                        )}
                    </div>
                </div>
            </Card>

            {/* Free Cash */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Wallet className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Free Cash
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${stats.freeCash < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        Rs. {formatCurrency(stats.freeCash)}
                    </div>
                    {stats.freeCash < 0 && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[9px] font-bold border border-rose-200">
                                <AlertTriangle size={10} />
                                <span>Negative</span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Buying Power</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Current Cash Invested */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Scale className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Current Cash Invested
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.netPrincipal)}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Net Principal</span>
                        {isCapitalEroded && (
                            <span className="text-rose-500 flex items-center gap-1" title="Principal Eroded">
                                -{formatCurrency(erosionAmount)}
                            </span>
                        )}
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Lifetime Cash Investment */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <History className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Lifetime Cash Investment
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.peakNetPrincipal)}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Peak Capital</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-400 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* ROW 2: Holdings, Profits & Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            
             {/* Current Stock Value */}
             <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <BarChart3 className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Current Stock Value
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.totalValue)}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Market Value</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Stock Assets (Cost) - UPDATED WITH REINVESTED GAINS */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <DollarSign className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Stock Assets (Cost)
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                        Rs. {formatCurrency(stats.totalCost)}
                    </div>
                    {/* NEW: Reinvested Gains Badge */}
                    {stats.reinvestedProfits > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 w-fit">
                             <RefreshCcw size={10} />
                             <span>Reinvested Gains: {formatCurrency(stats.reinvestedProfits)}</span>
                        </div>
                    )}
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Active Holdings</span>
                        <span>{(stats.totalValue + Math.abs(stats.freeCash) > 0 ? (stats.totalCost / (stats.totalValue + Math.abs(stats.freeCash)) * 100).toFixed(0) : 0)}% Alloc</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Unrealized P&L */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Activity className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Unrealized P&L
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isUnrealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {isUnrealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.unrealizedPL))}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 w-full">
                        <div className={`text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-md border ${isUnrealizedProfitable ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-200 text-rose-700'}`}>
                            {isUnrealizedProfitable ? '+' : ''}{stats.unrealizedPLPercent.toFixed(2)}%
                        </div>
                        
                        {/* Moved to far right */}
                        <div className={`ml-auto text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-md border ${isTotalReturnPositive ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`} title="Net Portfolio Return (Total Assets vs Invested)">
                            Net: {isTotalReturnPositive ? '+' : ''}{totalReturnPercent.toFixed(2)}%
                        </div>
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>{isUnrealizedProfitable ? 'Profit Ratio' : 'Loss Ratio'}</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                         {stats.totalCost > 0 || stats.totalValue > 0 ? (
                             isUnrealizedProfitable ? (
                                 <>
                                    <div className="h-full bg-slate-400/50" style={{ width: `${Math.min((stats.totalCost / (stats.totalValue || 1)) * 100, 100)}%` }} title="Cost Basis"></div>
                                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min((stats.unrealizedPL / (stats.totalValue || 1)) * 100, 100)}%` }} title="Profit"></div>
                                 </>
                             ) : (
                                 <>
                                    <div className="h-full bg-slate-400/50" style={{ width: `${Math.min((stats.totalValue / (stats.totalCost || 1)) * 100, 100)}%` }} title="Current Value"></div>
                                    <div className="h-full bg-rose-500" style={{ width: `${Math.min((Math.abs(stats.unrealizedPL) / (stats.totalCost || 1)) * 100, 100)}%` }} title="Loss"></div>
                                 </>
                             )
                         ) : (
                             <div className="h-full bg-slate-200 w-full"></div>
                         )}
                    </div>
                </div>
            </Card>

            {/* Today's P&L */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Activity className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <div>
                        <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                            Today's P&L
                        </h3>
                        {/* Display the Last Updated Date if available */}
                        {lastUpdated && (
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                                {formatTime(lastUpdated)}
                            </p>
                        )}
                    </div>
                </div>

                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isDailyProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {isDailyProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.dailyPL))}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-md border ${isDailyProfitable ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-200 text-rose-700'}`}>
                            {isDailyProfitable ? '+' : ''}{stats.dailyPLPercent?.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Daily Variation</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full w-full ${isDailyProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    </div>
                </div>
            </Card>

            {/* Realized Gains */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Realized Gains (Net)
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isRealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {isRealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.netRealizedPL))}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Gross: {formatCurrency(stats.realizedPL)}</span>
                        <span className="text-rose-500">Tax: -{formatCurrency(stats.totalCGT)}</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full ${isRealizedProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Dividends (Net) */}
            <Card>
                <div className="flex items-start gap-2 md:gap-3 mb-3 md:mb-5">
                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                        <Coins className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                    </div>
                    <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] leading-tight mt-0.5">
                        Dividends (Net)
                    </h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                        Rs. {formatCurrency(stats.totalDividends)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                         <div className="text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-100">
                             Yield: {dividendYield.toFixed(2)}%
                         </div>
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Gross: {formatCurrency(grossDividends)}</span>
                        <span className="text-rose-500">Tax: -{formatCurrency(stats.totalDividendTax)}</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* ROW 3: Fees Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-2">
            <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Receipt size={18} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Commission</div>
                    <div className="text-sm md:text-lg font-bold text-slate-700">{formatCurrency(stats.totalCommission)}</div>
                </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Building2 size={18} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Taxes (SST/WHT)</div>
                    <div className="text-sm md:text-lg font-bold text-slate-700">{formatCurrency(stats.totalSalesTax + stats.totalDividendTax)}</div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><FileText size={18} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CDC & Other</div>
                    <div className="text-sm md:text-lg font-bold text-slate-700">{formatCurrency(stats.totalCDC + stats.totalOtherFees)}</div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><PiggyBank size={18} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total CGT</div>
                    <div className="text-sm md:text-lg font-bold text-slate-700">{formatCurrency(stats.totalCGT)}</div>
                </div>
            </div>
        </div>

    </div>
  );
};
