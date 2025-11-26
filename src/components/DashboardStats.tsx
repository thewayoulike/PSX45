import React from 'react';
import { PortfolioStats } from '../types';
import { Card } from './ui/Card';
import { DollarSign, Briefcase, CheckCircle2, Activity, Coins, Receipt, Building2, FileText, PiggyBank, Wallet, Scale, RefreshCcw, AlertTriangle, TrendingDown } from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
}

const Sparkline = ({ color, trend }: { color: string, trend: 'up' | 'down' | 'neutral' }) => {
  const pathUp = "M0 25 Q 20 25, 40 15 T 80 10 T 120 2";
  const pathDown = "M0 5 Q 20 5, 40 15 T 80 20 T 120 28";
  const pathNeutral = "M0 15 Q 20 10, 40 15 T 80 15 T 120 15";
  
  const d = trend === 'up' ? pathUp : trend === 'down' ? pathDown : pathNeutral;

  return (
    <div className="h-6 md:h-8 w-full overflow-hidden opacity-80 mt-2">
      <svg viewBox="0 0 120 30" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke={`url(#grad-${color})`} strokeWidth="2" vectorEffect="non-scaling-stroke" className={color} strokeLinecap="round" />
      </svg>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  const isUnrealizedProfitable = stats.unrealizedPL >= 0;
  const isRealizedProfitable = stats.netRealizedPL >= 0; 
  
  // Capital Analysis
  const totalNetWorth = stats.totalValue + stats.freeCash;
  const isCapitalEroded = totalNetWorth < stats.cashInvestment;
  const erosionAmount = stats.cashInvestment - totalNetWorth;
  const erosionPercent = stats.cashInvestment > 0 ? (erosionAmount / stats.cashInvestment) * 100 : 0;
  const isSevereLoss = erosionPercent > 20; // 20% threshold for severe warning

  const formatCurrency = (val: number) => 
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-4 md:gap-6 mb-6 md:mb-10">
        
        {/* PRIMARY METRICS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            
            {/* Total Assets Card */}
            <Card title="Total Assets" icon={<Briefcase className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className="flex justify-between items-start">
                    <div className="w-full">
                        <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-baseline gap-0.5 flex-wrap">
                            <span>Rs. {formatCurrency(totalNetWorth)}</span>
                        </div>
                        
                        {/* Dynamic Status Indicator */}
                        <div className="flex items-center gap-2 mt-2 md:mt-3">
                            {isSevereLoss ? (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[10px] font-bold border border-rose-200 animate-pulse">
                                    <AlertTriangle size={12} />
                                    <span>Risk: -{erosionPercent.toFixed(1)}%</span>
                                </div>
                            ) : isCapitalEroded ? (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[10px] font-bold border border-amber-200">
                                    <TrendingDown size={12} />
                                    <span>Below Principal</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
                                    </div>
                                    <span className="text-[10px] md:text-xs text-emerald-600 font-semibold tracking-wide uppercase">Healthy</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <Sparkline color={isCapitalEroded ? "text-amber-500" : "text-emerald-500"} trend="neutral" />
            </Card>

            {/* FREE CASH CARD */}
            <Card title="Free Cash" icon={<Wallet className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={`text-lg sm:text-2xl md:text-3xl font-bold tracking-tight ${stats.freeCash < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    Rs. {formatCurrency(stats.freeCash)}
                </div>
                
                <div className="mt-3 md:mt-4">
                    {stats.freeCash < 0 ? (
                        <div className="flex items-center gap-2 text-[10px] text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 font-bold">
                            <AlertTriangle size={12} />
                            <span>Negative Balance! Add Deposit.</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                                <span>Buying Power</span>
                            </div>
                            <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            {/* CASH INVESTMENT CARD */}
            <Card title="Cash Investment" icon={<Scale className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
                Rs. {formatCurrency(stats.cashInvestment)}
                </div>
                <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Principal (Net)</span>
                        {isCapitalEroded && (
                            <span className="text-rose-500 flex items-center gap-1">
                                -{formatCurrency(erosionAmount)} Loss
                            </span>
                        )}
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isSevereLoss ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* REINVESTED PROFITS CARD */}
            <Card title="Reinvested Profits" icon={<RefreshCcw className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
                Rs. {formatCurrency(stats.reinvestedProfits)}
                </div>
                <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Retained Earnings</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* SECONDARY METRICS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            
            {/* Stock Assets Card */}
            <Card title="Stock Assets (Cost)" icon={<DollarSign className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
                Rs. {formatCurrency(stats.totalCost)}
                </div>
                <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Active Holdings</span>
                        <span>{(stats.totalValue + Math.abs(stats.freeCash) > 0 ? (stats.totalCost / (stats.totalValue + Math.abs(stats.freeCash)) * 100).toFixed(0) : 0)}% Allocation</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Unrealized P&L Card */}
            <Card title="Unrealized P&L" icon={<Activity className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={`text-lg sm:text-2xl md:text-3xl font-bold tracking-tight ${isUnrealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isUnrealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.unrealizedPL))}
                </div>
                
                <div className="flex items-center justify-between mt-2">
                    <div className={`text-xs md:text-sm font-bold px-1.5 md:px-2.5 py-0.5 rounded-md border ${isUnrealizedProfitable ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-200 text-rose-700'}`}>
                        {isUnrealizedProfitable ? '+' : ''}{stats.unrealizedPLPercent.toFixed(2)}%
                    </div>
                </div>
                
                <Sparkline 
                    color={isUnrealizedProfitable ? 'text-emerald-500' : 'text-rose-500'} 
                    trend={isUnrealizedProfitable ? 'up' : 'down'} 
                />
            </Card>

            {/* Realized P&L Card (NET) */}
            <Card title="Realized Gains (Net)" icon={<CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className={`text-lg sm:text-2xl md:text-3xl font-bold tracking-tight ${isRealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isRealizedProfitable ? '+' : ''}Rs. {formatCurrency(Math.abs(stats.netRealizedPL))}
                </div>
                
                <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Gross: {formatCurrency(stats.realizedPL)}</span>
                        <span className="text-rose-500">Tax: -{formatCurrency(stats.totalCGT)}</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full ${isRealizedProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>

            {/* Dividend Income Card */}
            <Card title="Dividends" icon={<Coins className="w-4 h-4 md:w-[18px] md:h-[18px]" />}>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
                    Rs. {formatCurrency(stats.totalDividends)}
                </div>
                <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                        <span>Passive Income</span>
                        <span className="text-slate-500 font-bold">Net</span>
                    </div>
                    <div className="h-1 md:h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
                    </div>
                </div>
            </Card>
        </div>

        {/* FEES BREAKDOWN */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Receipt size={20} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Commission</div>
                    <div className="text-lg font-bold text-slate-700">{formatCurrency(stats.totalCommission)}</div>
                </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Building2 size={20} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Taxes (SST/WHT)</div>
                    <div className="text-lg font-bold text-slate-700">{formatCurrency(stats.totalSalesTax + stats.totalDividendTax)}</div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><FileText size={20} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CDC & Other</div>
                    <div className="text-lg font-bold text-slate-700">{formatCurrency(stats.totalCDC + stats.totalOtherFees)}</div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><PiggyBank size={20} /></div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Est. CGT (15%)</div>
                    <div className="text-lg font-bold text-slate-700">{formatCurrency(stats.totalCGT)}</div>
                </div>
            </div>
        </div>

    </div>
  );
};
