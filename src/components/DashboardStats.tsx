import React from 'react';
import { PortfolioStats } from '../types';
import { Card } from './ui/Card';
import { DollarSign, Briefcase, CheckCircle2, Activity, Coins, Receipt, Building2, FileText, PiggyBank, Wallet, Scale, TrendingUp, AlertTriangle, TrendingDown, Percent, BarChart3, History, Info, RefreshCcw, Stamp } from 'lucide-react';

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

  const dividendYield = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;
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

  let roiExcDiv = 0;
  const denominator = stats.netPrincipal > 0 ? stats.netPrincipal : (stats.peakNetPrincipal > 0 ? stats.peakNetPrincipal : 1);

  if (denominator > 0) {
      const totalProfitValue = (stats.roi / 100) * denominator;
      const profitExcDiv = totalProfitValue - stats.totalDividends;
      roiExcDiv = (profitExcDiv / denominator) * 100;
  }
  
  const isRoiExcPositive = roiExcDiv >= 0;

  const formatCurrency = (val: number) => 
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const formatTime = (isoString: string) => {
      return new Date(isoString).toLocaleString('en-US', { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
  };

  const TOP_SECTION_CLASS = "min-h-[3rem] flex flex-col justify-center"; 
  const LABEL_CLASS = "text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mt-0.5 truncate";
  const ICON_BOX_CLASS = "p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm group-hover:text-emerald-700 transition-colors";
  const VALUE_SIZE_CLASS = "text-lg sm:text-xl lg:text-lg xl:text-2xl font-bold tracking-tight"; 
  
  const FOOTER_CLASS = "mt-auto pt-2";

  const getMwrrTooltip = () => {
      if (stats.mwrr <= -99) return "Why -100%? You suffered a loss almost immediately after depositing. Since MWRR is an annualized metric (XIRR), it projects this rate of loss over a full year.";
      if (stats.mwrr >= 500) return "Why so high? You made a profit very quickly after depositing. MWRR annualizes this short-term gain.";
      return "Money-Weighted Rate of Return (XIRR): Calculates your personal performance by weighing your returns against the timing and size of your deposits and withdrawals.";
  };

  return (
    <div className="flex flex-col gap-3 mb-6 md:mb-10">
        
        {/* ROW 1: Performance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
           {/* 1. MWRR */}
           <Card>
                <div className="flex items-start gap-2 mb-2 relative">
                    <div className={ICON_BOX_CLASS}>
                        <TrendingUp size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>MWRR</h3>
                    <div className="absolute top-0 right-0 -mt-1 -mr-1">
                        <div className="text-slate-300 dark:text-slate-600 hover:text-indigo-500 cursor-help transition-colors p-1" title={getMwrrTooltip()}>
                            <Info size={12} />
                        </div>
                    </div>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} ${isMwrrPositive ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isMwrrPositive ? '+' : ''}{stats.mwrr.toFixed(2)}%
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isMwrrPositive ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 2. ROI */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Percent size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>ROI</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex items-baseline justify-between w-full">
                            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">Inc. Div</span>
                            <span className={`font-bold ${isRoiPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} text-sm lg:text-xs xl:text-base`}>
                                {isRoiPositive ? '+' : ''}{stats.roi.toFixed(2)}%
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between w-full">
                            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">Exc. Div</span>
                            <span className={`font-bold ${isRoiExcPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} text-sm lg:text-xs xl:text-base`}>
                                {isRoiExcPositive ? '+' : ''}{roiExcDiv.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${isRoiPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 3. Free Cash */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Wallet size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Free Cash</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} ${stats.freeCash < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                        Rs. {formatCurrency(stats.freeCash)}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 4. Today's P&L */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Activity size={16} />
                    </div>
                    <div>
                        <h3 className={LABEL_CLASS}>Today's P&L</h3>
                        {lastUpdated && (
                            <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                                {formatTime(lastUpdated)}
                            </p>
                        )}
                    </div>
                </div>

                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} ${isDailyProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {isDailyProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.dailyPL))}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${isDailyProfitable ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'}`}>
                            {isDailyProfitable ? '+' : ''}{stats.dailyPLPercent?.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        <div className={`h-full w-full ${isDailyProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    </div>
                </div>
            </Card>

            {/* 5. Unrealized P&L */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Activity size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Unrealized</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} ${isUnrealizedProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        <div className="flex flex-col">
                            <span>{isUnrealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.unrealizedPL))}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1 mt-1">
                        <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${isUnrealizedProfitable ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'}`}>
                            {isUnrealizedProfitable ? '+' : ''}{stats.unrealizedPLPercent.toFixed(2)}%
                        </div>
                        <div className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${isTotalReturnPositive ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800' : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 border-orange-100 dark:border-orange-800'}`} title="Net Portfolio Return">
                            Net: {isTotalReturnPositive ? '+' : ''}{totalReturnPercent.toFixed(2)}%
                        </div>
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                         {stats.totalCost > 0 || stats.totalValue > 0 ? (
                             isUnrealizedProfitable ? (
                                 <>
                                    <div className="h-full bg-slate-400/50 dark:bg-slate-600/50" style={{ width: `${Math.min((stats.totalCost / (stats.totalValue || 1)) * 100, 100)}%` }}></div>
                                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min((stats.unrealizedPL / (stats.totalValue || 1)) * 100, 100)}%` }}></div>
                                 </>
                             ) : (
                                 <>
                                    <div className="h-full bg-slate-400/50 dark:bg-slate-600/50" style={{ width: `${Math.min((stats.totalValue / (stats.totalCost || 1)) * 100, 100)}%` }}></div>
                                    <div className="h-full bg-rose-500" style={{ width: `${Math.min((Math.abs(stats.unrealizedPL) / (stats.totalCost || 1)) * 100, 100)}%` }}></div>
                                 </>
                             )
                         ) : (
                             <div className="h-full bg-slate-200 dark:bg-slate-700 w-full"></div>
                         )}
                    </div>
                </div>
            </Card>

            {/* 6. Realized Gains (Net) */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <CheckCircle2 size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Realized (Net)</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} ${isRealizedProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {isRealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.netRealizedPL))}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-semibold">
                        <span>Gross: {formatCurrency(stats.realizedPL)}</span>
                        <span className="text-rose-500 dark:text-rose-400">Tax: -{formatCurrency(stats.totalCGT)}</span>
                    </div>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        <div className={`h-full ${isRealizedProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* ROW 2: Capital & Assets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
             {/* 1. Cost Basis */}
             <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <DollarSign size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Cost Basis</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                        Rs. {formatCurrency(stats.totalCost)}
                    </div>
                    {stats.reinvestedProfits > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-800 w-fit">
                             <RefreshCcw size={8} />
                             <span>Reinvest: {formatCurrency(stats.reinvestedProfits)}</span>
                        </div>
                    )}
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

             {/* 2. Current Stock Value */}
             <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <BarChart3 size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Stock Value</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                    Rs. {formatCurrency(stats.totalValue)}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 3. Total Assets */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Briefcase size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Assets</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className="w-full">
                        <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                            Rs. {formatCurrency(totalNetWorth)}
                        </div>
                        {(isSevereLoss || isCapitalEroded) && (
                            <div className="flex items-center gap-1 mt-1">
                                <div className={`flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-bold border ${isSevereLoss ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'}`}>
                                    <TrendingDown size={8} />
                                    <span>{isSevereLoss ? `Risk: -${erosionPercent.toFixed(1)}%` : 'Below Cap'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        {!isCapitalEroded ? (
                            <div className="h-full bg-emerald-500 w-full rounded-full"></div>
                        ) : (
                            <>
                                <div className="h-full bg-emerald-500" style={{ width: `${100 - erosionPercent}%` }} />
                                <div className="h-full bg-rose-500" style={{ width: `${erosionPercent}%` }} />
                            </>
                        )}
                    </div>
                </div>
            </Card>

            {/* 4. Net Invested */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Scale size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Net Invested</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                    Rs. {formatCurrency(stats.netPrincipal)}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 5. Peak Capital */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <History size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Peak Capital</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                    Rs. {formatCurrency(stats.peakNetPrincipal)}
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-400 dark:bg-slate-600 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* 6. Dividends (Net) */}
            <Card>
                <div className="flex items-start gap-2 mb-2">
                    <div className={ICON_BOX_CLASS}>
                        <Coins size={16} />
                    </div>
                    <h3 className={LABEL_CLASS}>Dividends</h3>
                </div>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`${VALUE_SIZE_CLASS} text-slate-800 dark:text-slate-100`}>
                        Rs. {formatCurrency(stats.totalDividends)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                         <div className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800">
                             Yield: {dividendYield.toFixed(2)}%
                         </div>
                    </div>
                </div>
                <div className={FOOTER_CLASS}>
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-semibold">
                        <span>Gross: {formatCurrency(grossDividends)}</span>
                        <span className="text-rose-500 dark:text-rose-400">Tax: -{formatCurrency(stats.totalDividendTax)}</span>
                    </div>
                    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* ROW 3: Fees Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
            {/* 1. Commission */}
            <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="p-2 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-800 transition-colors"><Receipt size={16} /></div>
                <div className="min-w-0">
                    <div className={LABEL_CLASS}>Commission</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stats.totalCommission)}</div>
                </div>
            </div>
            
            {/* 2. Sales Tax (SST) */}
            <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="p-2 bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg group-hover:bg-purple-100 dark:group-hover:bg-purple-800 transition-colors"><Building2 size={16} /></div>
                <div className="min-w-0">
                    <div className={LABEL_CLASS}>Taxes (SST)</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stats.totalSalesTax)}</div>
                </div>
            </div>

            {/* 3. CDC Charges */}
            <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="p-2 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg group-hover:bg-orange-100 dark:group-hover:bg-orange-800 transition-colors"><FileText size={16} /></div>
                <div className="min-w-0">
                    <div className={LABEL_CLASS}>CDC Charges</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stats.totalCDC)}</div>
                </div>
            </div>

            {/* 4. Capital Gains Tax (CGT) */}
            <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="p-2 bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-lg group-hover:bg-rose-100 dark:group-hover:bg-rose-800 transition-colors"><PiggyBank size={16} /></div>
                <div className="min-w-0">
                    <div className={LABEL_CLASS}>Total CGT</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stats.totalCGT)}</div>
                </div>
            </div>

            {/* 5. Other Fees / Adjustments */}
            <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="p-2 bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-400 rounded-lg group-hover:bg-slate-100 dark:group-hover:bg-slate-600 transition-colors"><Stamp size={16} /></div>
                <div className="min-w-0">
                    <div className={LABEL_CLASS}>Other Fees</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stats.totalOtherFees)}</div>
                </div>
            </div>
        </div>
    </div>
  );
};
