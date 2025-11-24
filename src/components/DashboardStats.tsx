import React from 'react';
import { PortfolioStats } from '../types';
import { Card } from './ui/Card';
import { DollarSign, Briefcase, CheckCircle2, Activity, Coins } from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
}

// SVG Sparkline Component for visual momentum
const Sparkline = ({ color, trend }: { color: string, trend: 'up' | 'down' | 'neutral' }) => {
  const pathUp = "M0 25 Q 20 25, 40 15 T 80 10 T 120 2";
  const pathDown = "M0 5 Q 20 5, 40 15 T 80 20 T 120 28";
  const pathNeutral = "M0 15 Q 20 10, 40 15 T 80 15 T 120 15";
  
  const d = trend === 'up' ? pathUp : trend === 'down' ? pathDown : pathNeutral;

  return (
    <div className="h-8 w-full overflow-hidden opacity-80 mt-2">
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
  const isRealizedProfitable = stats.realizedPL >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-10">
      
      {/* Total Value Card */}
      <Card title="Total Assets" icon={<Briefcase size={18} />}>
        <div className="flex justify-between items-start">
            <div>
                <div className="text-3xl font-bold text-slate-800 tracking-tight">
                Rs. {stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-lg text-slate-400 font-normal">.{stats.totalValue.toFixed(2).split('.')[1] || '00'}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                    <span className="text-xs text-emerald-600 font-semibold tracking-wide uppercase">Live Market Data</span>
                </div>
            </div>
        </div>
        <Sparkline color="text-emerald-500" trend="neutral" />
      </Card>

      {/* Total Invested Card */}
      <Card title="Invested Capital" icon={<DollarSign size={18} />}>
        <div className="text-3xl font-bold text-slate-800 tracking-tight">
          Rs. {stats.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          <span className="text-lg text-slate-400 font-normal">.{stats.totalCost.toFixed(2).split('.')[1] || '00'}</span>
        </div>
        <div className="mt-4">
             <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                 <span>Utilization</span>
                 <span>100%</span>
             </div>
             <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }}></div>
             </div>
        </div>
      </Card>

      {/* Unrealized P&L Card */}
      <Card title="Unrealized P&L" icon={<Activity size={18} />}>
        <div className={`text-3xl font-bold tracking-tight ${isUnrealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
          {isUnrealizedProfitable ? '+' : ''}Rs. {Math.abs(stats.unrealizedPL).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        
        <div className="flex items-center justify-between mt-2">
             <div className={`text-sm font-bold px-2.5 py-0.5 rounded-md border ${isUnrealizedProfitable ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-200 text-rose-700'}`}>
                {isUnrealizedProfitable ? '+' : ''}{stats.unrealizedPLPercent.toFixed(2)}%
            </div>
        </div>
        
        <Sparkline 
            color={isUnrealizedProfitable ? 'text-emerald-500' : 'text-rose-500'} 
            trend={isUnrealizedProfitable ? 'up' : 'down'} 
        />
      </Card>

      {/* Realized P&L Card (Capital Gains) */}
      <Card title="Realized Gains" icon={<CheckCircle2 size={18} />}>
         <div className={`text-3xl font-bold tracking-tight ${isRealizedProfitable ? 'text-emerald-600' : 'text-rose-500'}`}>
          {isRealizedProfitable ? '+' : ''}Rs. {Math.abs(stats.realizedPL).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        
        <div className="mt-4">
             <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                 <span>Trading Profit</span>
             </div>
             <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                 <div className={`h-full ${isRealizedProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: '100%' }}></div>
             </div>
        </div>
      </Card>

      {/* Dividend Income Card */}
      <Card title="Dividends Collected" icon={<Coins size={18} />}>
        <div className="text-3xl font-bold text-slate-800 tracking-tight">
            Rs. {stats.totalDividends.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className="mt-4">
             <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                 <span>Passive Income</span>
                 <span className="text-slate-500 font-bold">Net (After Tax)</span>
             </div>
             <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
             </div>
        </div>
      </Card>

    </div>
  );
}; 
