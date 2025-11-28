import React from 'react';
import { PortfolioStats } from '../types';
import { Card } from './ui/Card';
import { DollarSign, Briefcase, CheckCircle2, Activity, Coins, Receipt, Building2, FileText, PiggyBank, Wallet, Scale, RefreshCcw, AlertTriangle, TrendingDown, Percent, BarChart3, Landmark, History, TrendingUp } from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  const isUnrealizedProfitable = stats.unrealizedPL >= 0;
  const isRealizedProfitable = stats.netRealizedPL >= 0; 
  const isRoiPositive = stats.roi >= 0;
  const isMwrrPositive = stats.mwrr >= 0;
  
  const totalNetWorth = stats.totalValue + stats.freeCash;
  const isCapitalEroded = totalNetWorth < stats.netPrincipal;
  const erosionAmount = stats.netPrincipal - totalNetWorth;
  
  // Calculate percentage of principal lost, capped at 100% for visual sanity
  const erosionPercent = stats.netPrincipal > 0 ? Math.min((erosionAmount / stats.netPrincipal) * 100, 100) : 0;
  const isSevereLoss = erosionPercent > 20; 

  const formatCurrency = (val: number) => 
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // CONSTANT FOR ALIGNMENT
  // Enforces a minimum height for the value/badge section so all bars align
  const TOP_SECTION_CLASS = "min-h-[3.5rem] flex flex-col justify-center"; 

  return (
    <div className="flex flex-col gap-3 md:gap-4 mb-6 md:mb-10">
        
        {/* ROW 1: Key Performance & Capital */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            
            <Card title="Portfolio MWRR" icon={<TrendingUp className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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

            <Card title="Simple ROI" icon={<Percent className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isRoiPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isRoiPositive ? '+' : ''}{stats.roi.toFixed(2)}%
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Return on Capital</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isRoiPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

             <Card title="Total Assets" icon={<Briefcase className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className="w-full">
                        <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-baseline gap-0.5 flex-wrap">
                            <span>Rs. {formatCurrency(totalNetWorth)}</span>
                        </div>
                        {/* Only show badge if relevant to maintain height consistency logic, or allow it to expand */}
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
                        {!isSevereLoss && !isCapitalEroded && (
                             <div className="h-[18px]"></div> // Spacer to match badge height
                        )}
                    </div>
                </div>
                
                {/* Capital Preservation Bar */}
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Capital Status</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        {!isCapitalEroded ? (
                            // All Green if Healthy
                            <div className="h-full bg-emerald-500 w-full rounded-full"></div>
                        ) : (
                            // Stacked Bar: Green (Remaining) | Red (Lost)
                            <>
                                <div 
                                    className="h-full bg-emerald-500 transition-all duration-500" 
                                    style={{ width: `${100 - erosionPercent}%` }} 
                                />
                                <div 
                                    className="h-full bg-rose-500 transition-all duration-500" 
                                    style={{ width: `${erosionPercent}%` }} 
                                />
                            </>
                        )}
                    </div>
                </div>
            </Card>

             <Card title="Free Cash" icon={<Wallet className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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

            <Card title="Current Cash Invested" icon={<Scale className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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

            <Card title="Lifetime Cash Inv" icon={<History className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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
            
             <Card title="Current Stock Value" icon={<BarChart3 className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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

            <Card title="Stock Assets (Cost)" icon={<DollarSign className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.totalCost)}
                    </div>
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

            <Card title="Unrealized P&L" icon={<Activity className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight ${isUnrealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {isUnrealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.unrealizedPL))}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-md border ${isUnrealizedProfitable ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-200 text-rose-700'}`}>
                            {isUnrealizedProfitable ? '+' : ''}{stats.unrealizedPLPercent.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                {/* P&L Visualizer Bar */}
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>{isUnrealizedProfitable ? 'Profit Ratio' : 'Loss Ratio'}</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                         {stats.totalCost > 0 || stats.totalValue > 0 ? (
                             isUnrealizedProfitable ? (
                                 // Profit: Cost (Gray) + Profit (Green) = Total Value
                                 <>
                                    <div className="h-full bg-slate-400/50" style={{ width: `${Math.min((stats.totalCost / (stats.totalValue || 1)) * 100, 100)}%` }} title="Cost Basis"></div>
                                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min((stats.unrealizedPL / (stats.totalValue || 1)) * 100, 100)}%` }} title="Profit"></div>
                                 </>
                             ) : (
                                 // Loss: Value (Gray) + Loss (Red) = Total Cost
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

            <Card title="Realized Gains (Net)" icon={<CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
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

            <Card title="Dividends" icon={<Coins className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                        Rs. {formatCurrency(stats.totalDividends)}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Passive Income</span>
                        <span className="text-slate-500 font-bold">Net</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            <Card title="Reinvested Profits" icon={<RefreshCcw className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={TOP_SECTION_CLASS}>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.reinvestedProfits)}
                    </div>
                </div>
                <div className="mt-2 md:mt-3">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Retained Earnings</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

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
