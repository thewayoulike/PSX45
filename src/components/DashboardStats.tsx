import React from 'react';
import { Holding, PortfolioStats } from '../types';
import {
  Wallet, RefreshCw, ArrowDownRight, ArrowUpRight, DollarSign, Briefcase, CheckCircle2,
  Activity, Coins, Receipt, Building2, FileText, PiggyBank, Scale, TrendingUp, TrendingDown,
  Percent, BarChart3, History, Info, Stamp, ShieldCheck, Landmark, UserRound
} from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
  lastUpdated?: string | null;
  userName?: string;
  onRefresh?: () => void;
  trend?: number[];       // portfolio value/return series for the sparklines
  holdings?: Holding[];   // optional — sharpens the health score
}

const rs = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;

// --- tiny sparkline ---
const Spark: React.FC<{ data?: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) return <div className="h-10" />;
  const w = 300, h = 40;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity="0.08" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// --- heuristic 0–100 portfolio health ---
const healthScore = (stats: PortfolioStats, holdings?: Holding[]) => {
  let score = 50;
  const invested = stats.netPrincipal || stats.totalCost || 0;
  const totalReturnRs = stats.unrealizedPL + stats.netRealizedPL;
  const retPct = invested > 0 ? (totalReturnRs / invested) * 100 : 0;
  score += Math.max(-25, Math.min(25, retPct));

  const nw = stats.totalValue + stats.freeCash;
  const cashPct = nw > 0 ? (stats.freeCash / nw) * 100 : 0;
  if (cashPct >= 5 && cashPct <= 25) score += 10;
  else if (cashPct < 2 || cashPct > 50) score -= 8;
  else score += 3;

  const costs = stats.totalCommission + stats.totalSalesTax + stats.totalCDC + stats.totalOtherFees + stats.totalCGT;
  const gross = Math.max(0, totalReturnRs) + stats.totalDividends + costs;
  const feePct = gross > 0 ? (costs / gross) * 100 : 0;
  if (feePct > 0) { if (feePct < 10) score += 6; else if (feePct > 25) score -= 8; }

  if (stats.totalDividends > 0) score += 5;

  if (holdings && holdings.length && stats.totalValue > 0) {
    const vals = holdings.map((h) => h.currentPrice * h.quantity).sort((a, b) => b - a);
    const top3 = (vals.slice(0, 3).reduce((s, x) => s + x, 0) / stats.totalValue) * 100;
    if (top3 >= 70) score -= 10; else if (top3 <= 45) score += 6;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
};

const HeroCard: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode; badge?: React.ReactNode;
  colorClass: string; icon: React.ReactNode; iconWrap: string; trend?: number[]; sparkColor: string;
}> = ({ label, value, sub, badge, colorClass, icon, iconWrap, trend, sparkColor }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconWrap}`}>{icon}</div>
    </div>
    <div className={`text-2xl md:text-3xl font-black mt-3 ${colorClass}`}>{value}</div>
    <div className="min-h-[20px] mt-1 flex items-center gap-2">
      {sub && <span className="text-sm text-slate-500 dark:text-slate-400">{sub}</span>}
      {badge}
    </div>
    <div className="mt-2"><Spark data={trend} color={sparkColor} /></div>
  </div>
);

const Cell: React.FC<{
  icon: React.ReactNode; wrap: string; label: string; value: React.ReactNode;
  valueClass?: string; sub?: React.ReactNode; tip?: string;
}> = ({ icon, wrap, label, value, valueClass, sub, tip }) => (
  <div className="flex items-center gap-3 px-3 py-3">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${wrap}`}>{icon}</div>
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
        {label}{tip && <span title={tip} className="cursor-help text-slate-300 dark:text-slate-600"><Info size={11} /></span>}
      </div>
      <div className={`text-base font-bold leading-tight ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 font-semibold leading-tight">{sub}</div>}
    </div>
  </div>
);

const Strip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-1">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0.5">{children}</div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ stats, lastUpdated, userName, onRefresh, trend, holdings }) => {
  // Derived values (kept from your original)
  const totalNetWorth = stats.totalValue + stats.freeCash;
  const isCapitalEroded = totalNetWorth < stats.netPrincipal;
  const erosionAmount = stats.netPrincipal - totalNetWorth;
  const erosionPercent = stats.netPrincipal > 0 ? Math.min((erosionAmount / stats.netPrincipal) * 100, 100) : 0;
  const isSevereLoss = erosionPercent > 20;
  const totalReturnPercent = stats.netPrincipal > 0 ? ((totalNetWorth - stats.netPrincipal) / stats.netPrincipal) * 100 : 0;
  const totalReturnRs = totalNetWorth - stats.netPrincipal;
  const isTotalReturnPositive = totalReturnRs >= 0;

  const dividendYield = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;
  const grossDividends = stats.totalDividends + stats.totalDividendTax;

  let roiExcDiv = 0;
  const denom = stats.netPrincipal > 0 ? stats.netPrincipal : (stats.peakNetPrincipal > 0 ? stats.peakNetPrincipal : 1);
  if (denom > 0) {
    const totalProfitValue = (stats.roi / 100) * denom;
    roiExcDiv = ((totalProfitValue - stats.totalDividends) / denom) * 100;
  }

  const isDailyProfitable = stats.dailyPL >= 0;
  const score = healthScore(stats, holdings);
  const health = score >= 80 ? { label: 'Excellent', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
    : score >= 60 ? { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
    : score >= 40 ? { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
    : { label: 'Weak', bar: 'bg-rose-500', text: 'text-rose-500' };

  const mwrrTip = stats.mwrr <= -99
    ? 'Why -100%? A loss occurred almost immediately after depositing. MWRR (XIRR) annualizes this rate over a full year.'
    : stats.mwrr >= 500
    ? 'Why so high? A quick profit soon after depositing. MWRR annualizes this short-term gain.'
    : 'Money-Weighted Return (XIRR): weighs returns against the timing and size of your deposits and withdrawals.';

  const posNeg = (v: number) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';

  return (
    <div className="space-y-4 mb-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {userName ? `Welcome back, ${userName}` : 'Your portfolio'} <span className="align-middle">👋</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Here's how your portfolio is performing today.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-slate-400 whitespace-nowrap">Last updated: {new Date(lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
          {onRefresh && (
            <button onClick={onRefresh} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-xl text-sm font-bold shadow-sm transition-colors">
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard
          label="Portfolio Value"
          value={rs(totalNetWorth)}
          colorClass="text-slate-900 dark:text-slate-100"
          sub={<>Invested: <span className="font-bold text-slate-600 dark:text-slate-300">{rs(stats.netPrincipal)}</span></>}
          badge={(isCapitalEroded || isSevereLoss) && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${isSevereLoss ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'}`}>
              <TrendingDown size={9} />{isSevereLoss ? `Risk -${erosionPercent.toFixed(1)}%` : 'Below Cap'}
            </span>
          )}
          icon={<Wallet size={18} className="text-blue-600 dark:text-blue-400" />}
          iconWrap="bg-blue-50 dark:bg-blue-900/30"
          trend={trend} sparkColor="#3b82f6"
        />
        <HeroCard
          label="Total Return"
          value={<>{spct(totalReturnPercent)} {isTotalReturnPositive ? <ArrowUpRight size={20} className="inline -mt-1" /> : <ArrowDownRight size={20} className="inline -mt-1" />}</>}
          colorClass={posNeg(totalReturnRs)}
          sub={<span className="font-bold text-slate-700 dark:text-slate-200">{isTotalReturnPositive ? '+' : '-'}{rs(Math.abs(totalReturnRs))}</span>}
          icon={<TrendingUp size={17} className={isTotalReturnPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} />}
          iconWrap={isTotalReturnPositive ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}
          trend={trend} sparkColor={isTotalReturnPositive ? '#10b981' : '#f43f5e'}
        />
        <HeroCard
          label="Today's P&L"
          value={<>{isDailyProfitable ? '+' : '-'}{rs(Math.abs(stats.dailyPL))} {isDailyProfitable ? <ArrowUpRight size={20} className="inline -mt-1" /> : <ArrowDownRight size={20} className="inline -mt-1" />}</>}
          colorClass={posNeg(stats.dailyPL)}
          sub={<span className="text-slate-600 dark:text-slate-300">{spct(stats.dailyPLPercent || 0)}</span>}
          icon={<Activity size={17} className={isDailyProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} />}
          iconWrap={isDailyProfitable ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}
          trend={trend} sparkColor={isDailyProfitable ? '#10b981' : '#f43f5e'}
        />
      </div>

      {/* Strip A — performance */}
      <Strip>
        <Cell icon={<TrendingUp size={17} className="text-indigo-600 dark:text-indigo-400" />} wrap="bg-indigo-50 dark:bg-indigo-900/30"
          label="MWRR" tip={mwrrTip} value={<span className={stats.mwrr >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500'}>{spct(stats.mwrr)}</span>} />
        <Cell icon={<Percent size={17} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-900/30"
          label="ROI" value={<span className={posNeg(stats.roi)}>{spct(stats.roi)}</span>} sub={`Exc. div ${spct(roiExcDiv)}`} />
        <Cell icon={<Coins size={17} className="text-purple-600 dark:text-purple-400" />} wrap="bg-purple-50 dark:bg-purple-900/30"
          label="Dividends" value={`+${rs(stats.totalDividends)}`} sub={`Yield ${dividendYield.toFixed(2)}% · tax -${rs0(stats.totalDividendTax)}`} />
        <Cell icon={<CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-900/30"
          label="Realized (Net)" value={<span className={posNeg(stats.netRealizedPL)}>{stats.netRealizedPL >= 0 ? '+' : '-'}{rs(Math.abs(stats.netRealizedPL))}</span>} sub={`CGT -${rs0(stats.totalCGT)}`} />
        <Cell icon={<Activity size={17} className="text-rose-500" />} wrap="bg-rose-50 dark:bg-rose-900/30"
          label="Unrealized" value={<span className={posNeg(stats.unrealizedPL)}>{stats.unrealizedPL >= 0 ? '+' : '-'}{rs(Math.abs(stats.unrealizedPL))}</span>} sub={spct(stats.unrealizedPLPercent)} />
      </Strip>

      {/* Strip B — capital */}
      <Strip>
        <Cell icon={<DollarSign size={17} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-900/30"
          label="Cost Basis" value={rs(stats.totalCost)} sub={stats.reinvestedProfits > 0 ? `Reinvest ${rs0(stats.reinvestedProfits)}` : undefined} />
        <Cell icon={<BarChart3 size={17} className="text-teal-600 dark:text-teal-400" />} wrap="bg-teal-50 dark:bg-teal-900/30"
          label="Stock Value" value={rs(stats.totalValue)} />
        <Cell icon={<Landmark size={17} className="text-blue-600 dark:text-blue-400" />} wrap="bg-blue-50 dark:bg-blue-900/30"
          label="Free Cash" value={<span className={stats.freeCash < 0 ? 'text-rose-500' : ''}>{rs(stats.freeCash)}</span>} />
        <Cell icon={<Scale size={17} className="text-indigo-600 dark:text-indigo-400" />} wrap="bg-indigo-50 dark:bg-indigo-900/30"
          label="Net Invested" value={rs(stats.netPrincipal)} />
        <Cell icon={<History size={17} className="text-slate-500 dark:text-slate-400" />} wrap="bg-slate-100 dark:bg-slate-800"
          label="Peak Capital" value={rs(stats.peakNetPrincipal)} />
      </Strip>

      {/* Costs + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0.5">
            {[
              { label: 'Commission', v: stats.totalCommission, icon: <Receipt size={15} className="text-blue-600 dark:text-blue-400" />, wrap: 'bg-blue-50 dark:bg-blue-900/30' },
              { label: 'Taxes (SST)', v: stats.totalSalesTax, icon: <Building2 size={15} className="text-purple-600 dark:text-purple-400" />, wrap: 'bg-purple-50 dark:bg-purple-900/30' },
              { label: 'CDC Charges', v: stats.totalCDC, icon: <FileText size={15} className="text-orange-600 dark:text-orange-400" />, wrap: 'bg-orange-50 dark:bg-orange-900/30' },
              { label: 'Total CGT', v: stats.totalCGT, icon: <PiggyBank size={15} className="text-rose-500" />, wrap: 'bg-rose-50 dark:bg-rose-900/30' },
              { label: 'Other Fees', v: stats.totalOtherFees, icon: <Stamp size={15} className="text-slate-500 dark:text-slate-400" />, wrap: 'bg-slate-100 dark:bg-slate-800' },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-3 px-3 py-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.wrap}`}>{c.icon}</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.label}</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{rs(c.v)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Portfolio Health</span>
              <span className={`text-xs font-bold ${health.text}`}>{health.label}</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{score}</span>
              <span className="text-xs text-slate-400 font-bold">/100</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className={`h-full rounded-full ${health.bar}`} style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
