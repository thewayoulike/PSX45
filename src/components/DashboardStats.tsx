import React from 'react';
import { Holding, PortfolioStats } from '../types';
import {
  Wallet, RefreshCw, ArrowDownRight, ArrowUpRight, DollarSign, CheckCircle2,
  Activity, Coins, Receipt, Building2, FileText, PiggyBank, Scale, TrendingUp, TrendingDown,
  Percent, BarChart3, History, Info, Stamp, ShieldCheck, Landmark
} from 'lucide-react';

interface DashboardProps {
  stats: PortfolioStats;
  lastUpdated?: string | null;
  userName?: string;
  onRefresh?: () => void;
  trend?: number[];        // portfolio value series (also drives sparklines)
  benchmark?: number[];    // KSE-100 value series, same window as trend (optional)
  holdings?: Holding[];    // enables the diversification pillar
}

const rs = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));

// --- tiny sparkline ---
const Spark: React.FC<{ data?: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) return <div className="h-10" />;
  const w = 300, h = 40;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-2" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity="0.08" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ---------- Portfolio Health (pillar model) ----------
interface Pillar { name: string; score: number; weight: number; }
interface Health { score: number; label: string; bar: string; text: string; pillars: Pillar[]; }

const dailyReturns = (series?: number[]): number[] => {
  if (!series || series.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) { const p = series[i - 1]; if (p) out.push((series[i] - p) / p); }
  return out;
};

const computeHealth = (stats: PortfolioStats, holdings?: Holding[], trend?: number[], benchmark?: number[]): Health => {
  const pillars: Pillar[] = [];
  const invested = stats.netPrincipal || stats.totalCost || 0;
  const totalReturnRs = stats.unrealizedPL + stats.netRealizedPL;
  const retPct = invested > 0 ? (totalReturnRs / invested) * 100 : 0;

  const pr = dailyReturns(trend);
  const br = dailyReturns(benchmark);

  // 1) Performance (30) — absolute, blended with benchmark-relative when available
  const absScore = clamp(50 + retPct * 2); 
  let perfScore = absScore;
  if (pr.length >= 10 && br.length >= 10) {
    const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    const excess = sum(pr) * 100 - sum(br) * 100; 
    const relScore = clamp(50 + excess * 3);
    perfScore = 0.6 * absScore + 0.4 * relScore;
  }
  pillars.push({ name: 'Performance', score: Math.round(perfScore), weight: 30 });

  // 2) Risk & diversification (25)
  const riskSubs: number[] = [];
  if (holdings && holdings.length && stats.totalValue > 0) {
    const weights = holdings.map((h) => (h.currentPrice * h.quantity) / stats.totalValue).filter((w) => w > 0);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    const effN = hhi > 0 ? 1 / hhi : 1;            
    riskSubs.push(clamp(((effN - 1) / 9) * 100));  
  }
  if (stats.peakNetPrincipal > 0) {
    const nw = stats.totalValue + stats.freeCash;
    const dd = Math.max(0, (stats.peakNetPrincipal - nw) / stats.peakNetPrincipal);
    riskSubs.push(clamp(100 - dd * 300));          
  }
  if (pr.length >= 15) {
    const downs = pr.filter((x) => x < 0);
    const dstd = downs.length ? Math.sqrt(downs.reduce((s, x) => s + x * x, 0) / pr.length) : 0;
    const annVol = dstd * Math.sqrt(252) * 100;    
    riskSubs.push(clamp(100 - annVol * 2));
  }
  if (riskSubs.length) pillars.push({ name: 'Risk', score: Math.round(riskSubs.reduce((s, x) => s + x, 0) / riskSubs.length), weight: 25 });

  // 3) Cost efficiency (15)
  const costs = stats.totalCommission + stats.totalSalesTax + stats.totalCDC + stats.totalOtherFees + stats.totalCGT;
  const gross = Math.max(0, totalReturnRs) + stats.totalDividends + costs;
  const costScore = costs > 0 && gross > 0 ? clamp(100 - (costs / gross) * 100 * 4) : 85; 
  pillars.push({ name: 'Cost', score: Math.round(costScore), weight: 15 });

  // 4) Liquidity (15)
  const nw = stats.totalValue + stats.freeCash;
  const cashPct = nw > 0 ? (stats.freeCash / nw) * 100 : 0;
  let liq: number;
  if (cashPct < 0) liq = 20;
  else if (cashPct >= 5 && cashPct <= 25) liq = 100 - (Math.abs(cashPct - 12) / 13) * 20;
  else if (cashPct < 5) liq = 60 + (cashPct / 5) * 20;
  else liq = 90 - (cashPct - 25) * 1.5;
  pillars.push({ name: 'Liquidity', score: Math.round(clamp(liq)), weight: 15 });

  // 5) Income (15)
  const y = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;
  const incScore = stats.totalDividends > 0 ? clamp(40 + y * 10) : 35; 
  pillars.push({ name: 'Income', score: Math.round(incScore), weight: 15 });

  const totW = pillars.reduce((s, p) => s + p.weight, 0) || 1;
  const score = Math.round(pillars.reduce((s, p) => s + p.score * p.weight, 0) / totW);
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Weak';
  const bar = score >= 60 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  const text = score >= 60 ? 'text-emerald-600 dark:text-emerald-400' : score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500';
  return { score, label, bar, text, pillars };
};

// ---------- Health breakdown popover ----------
const pillarBar = (s: number) => (s >= 60 ? 'bg-emerald-500' : s <= 40 ? 'bg-rose-500' : 'bg-amber-500');
const pillarText = (s: number) => (s >= 60 ? 'text-emerald-600 dark:text-emerald-400' : s <= 40 ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400');

const HealthPopover: React.FC<{ pillars: Pillar[]; score: number }> = ({ pillars, score }) => (
  <span className="relative group inline-flex align-middle" tabIndex={0}>
    <Info size={14} className="cursor-help text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 ml-1.5" />
    <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all duration-200 absolute z-50 top-6 right-0 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-card dark:shadow-card-dark p-4 text-left normal-case tracking-normal transform scale-95 group-hover:scale-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Score Breakdown</span>
        <span className="text-sm font-display font-black text-slate-900 dark:text-white">{score}/100</span>
      </div>
      <div className="space-y-2">
        {pillars.map((p) => {
          const good = p.score >= 60, bad = p.score <= 40;
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-black ${good ? 'bg-emerald-500' : bad ? 'bg-rose-500' : 'bg-amber-500'}`}>
                {good ? '+' : bad ? '−' : '~'}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex-1">
                {p.name} <span className="text-slate-400 font-normal ml-1">({p.weight}%)</span>
              </span>
              <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${pillarBar(p.score)} transition-all duration-1000 ease-out`} style={{ width: `${p.score}%` }} />
              </div>
              <span className={`text-[11px] font-bold w-6 text-right tabular-nums ${pillarText(p.score)}`}>{p.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  </span>
);

// ---------- reusable pieces ----------
const HeroCard: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode; badge?: React.ReactNode;
  colorClass: string; icon: React.ReactNode; iconWrap: string; trend?: number[]; sparkColor: string;
}> = ({ label, value, sub, badge, colorClass, icon, iconWrap, trend, sparkColor }) => (
  // Premium Card Styling with deep shadow and rounded corners
  <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6 transition-all hover:-translate-y-1 hover:shadow-card-hover duration-300 overflow-hidden group">
    {/* Soft background glow */}
    <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[50px] opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none ${iconWrap.split(' ')[0]}`}></div>
    
    <div className="relative z-10 flex items-start justify-between">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm ${iconWrap}`}>{icon}</div>
    </div>
    <div className={`text-3xl md:text-4xl font-display font-black mt-4 tracking-tight tabular-nums ${colorClass}`}>{value}</div>
    <div className="min-h-[24px] mt-1.5 flex items-center gap-2">
      {sub && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{sub}</span>}
      {badge}
    </div>
    <div className="mt-2 -mx-2 -mb-2"><Spark data={trend} color={sparkColor} /></div>
  </div>
);

const Cell: React.FC<{
  icon: React.ReactNode; wrap: string; label: string; value: React.ReactNode;
  valueClass?: string; sub?: React.ReactNode; tip?: string;
}> = ({ icon, wrap, label, value, valueClass, sub, tip }) => (
  <div className="flex items-center gap-3.5 px-4 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 rounded-2xl transition-colors">
    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${wrap}`}>{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
        {label}{tip && <span title={tip} className="cursor-help text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors"><Info size={12} /></span>}
      </div>
      <div className={`text-lg font-display font-black tracking-tight tabular-nums mt-0.5 ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 font-medium leading-tight mt-0.5">{sub}</div>}
    </div>
  </div>
);

const Strip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  // Premium Strip Container
  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-2">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">{children}</div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ stats, lastUpdated, userName, onRefresh, trend, benchmark, holdings }) => {
  const totalNetWorth = stats.totalValue + stats.freeCash;
  const isCapitalEroded = totalNetWorth < stats.netPrincipal;
  const erosionPercent = stats.netPrincipal > 0 ? Math.min(((stats.netPrincipal - totalNetWorth) / stats.netPrincipal) * 100, 100) : 0;
  const isSevereLoss = erosionPercent > 20;
  const totalReturnPercent = stats.netPrincipal > 0 ? ((totalNetWorth - stats.netPrincipal) / stats.netPrincipal) * 100 : 0;
  const totalReturnRs = totalNetWorth - stats.netPrincipal;
  const isTotalReturnPositive = totalReturnRs >= 0;

  const dividendYield = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;

  let roiExcDiv = 0;
  const denom = stats.netPrincipal > 0 ? stats.netPrincipal : (stats.peakNetPrincipal > 0 ? stats.peakNetPrincipal : 1);
  if (denom > 0) roiExcDiv = (((stats.roi / 100) * denom - stats.totalDividends) / denom) * 100;

  const isDailyProfitable = stats.dailyPL >= 0;
  const H = computeHealth(stats, holdings, trend, benchmark);

  const mwrrTip = stats.mwrr <= -99
    ? 'Why -100%? A loss occurred almost immediately after depositing. MWRR (XIRR) annualizes this rate over a full year.'
    : stats.mwrr >= 500
    ? 'Why so high? A quick profit soon after depositing. MWRR annualizes this short-term gain.'
    : 'Money-Weighted Return (XIRR): weighs returns against the timing and size of your deposits and withdrawals.';

  const posNeg = (v: number) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';

  return (
    <div className="space-y-6 mb-8">
      {/* Greeting - Animated */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">
            {userName ? `Welcome back, ${userName}` : 'Your Portfolio'} <span className="align-middle ml-1">👋</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Here's how your investments are performing today.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs font-medium text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full">Updated: {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          {onRefresh && (
            <button onClick={onRefresh} className="flex items-center gap-1.5 glass-input px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer">
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Hero cards - Staggered Animation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <HeroCard
          label="Total Net Worth" value={rs(totalNetWorth)} colorClass="text-slate-900 dark:text-white"
          sub={<>Invested: <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">{rs(stats.netPrincipal)}</span></>}
          badge={(isCapitalEroded || isSevereLoss) && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shadow-sm ${isSevereLoss ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50'}`}>
              <TrendingDown size={10} />{isSevereLoss ? `Risk -${erosionPercent.toFixed(1)}%` : 'Below Cap'}
            </span>
          )}
          icon={<Wallet size={20} className="text-blue-600 dark:text-blue-400" />} iconWrap="bg-blue-50 dark:bg-blue-500/20 border border-blue-100 dark:border-blue-500/30"
          trend={trend} sparkColor="#3b82f6"
        />
        <HeroCard
          label="Total Return"
          value={<>{spct(totalReturnPercent)} {isTotalReturnPositive ? <ArrowUpRight size={24} className="inline -mt-2 opacity-80" /> : <ArrowDownRight size={24} className="inline -mt-2 opacity-80" />}</>}
          colorClass={posNeg(totalReturnRs)}
          sub={<span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{isTotalReturnPositive ? '+' : '-'}{rs(Math.abs(totalReturnRs))}</span>}
          icon={<TrendingUp size={18} className={isTotalReturnPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} />}
          iconWrap={isTotalReturnPositive ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30' : 'bg-rose-50 dark:bg-rose-500/20 border border-rose-100 dark:border-rose-500/30'}
          trend={trend} sparkColor={isTotalReturnPositive ? '#10b981' : '#f43f5e'}
        />
        <HeroCard
          label="Today's P&L"
          value={<>{isDailyProfitable ? '+' : '-'}{rs(Math.abs(stats.dailyPL))} {isDailyProfitable ? <ArrowUpRight size={24} className="inline -mt-2 opacity-80" /> : <ArrowDownRight size={24} className="inline -mt-2 opacity-80" />}</>}
          colorClass={posNeg(stats.dailyPL)}
          sub={<span className="text-slate-600 dark:text-slate-400 font-bold tabular-nums">{spct(stats.dailyPLPercent || 0)}</span>}
          icon={<Activity size={18} className={isDailyProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} />}
          iconWrap={isDailyProfitable ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30' : 'bg-rose-50 dark:bg-rose-500/20 border border-rose-100 dark:border-rose-500/30'}
          trend={trend} sparkColor={isDailyProfitable ? '#10b981' : '#f43f5e'}
        />
      </div>

      {/* Strip A — performance */}
      <div className="animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        <Strip>
          <Cell icon={<TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />} wrap="bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-500/30"
            label="MWRR (XIRR)" tip={mwrrTip} value={<span className={stats.mwrr >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500 dark:text-rose-400'}>{spct(stats.mwrr)}</span>} />
          <Cell icon={<Percent size={18} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30"
            label="ROI" value={<span className={posNeg(stats.roi)}>{spct(stats.roi)}</span>} sub={`Exc. div ${spct(roiExcDiv)}`} />
          <Cell icon={<Coins size={18} className="text-purple-600 dark:text-purple-400" />} wrap="bg-purple-50 dark:bg-purple-500/20 border border-purple-100 dark:border-purple-500/30"
            label="Dividends" value={`+${rs0(stats.totalDividends)}`} sub={`Yield ${dividendYield.toFixed(2)}% · tax -${rs0(stats.totalDividendTax)}`} valueClass="text-purple-600 dark:text-purple-400" />
          <Cell icon={<CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30"
            label="Realized (Net)" value={<span className={posNeg(stats.netRealizedPL)}>{stats.netRealizedPL >= 0 ? '+' : '-'}{rs0(Math.abs(stats.netRealizedPL))}</span>} sub={`CGT -${rs0(stats.totalCGT)}`} />
          <Cell icon={<Activity size={18} className="text-rose-500 dark:text-rose-400" />} wrap="bg-rose-50 dark:bg-rose-500/20 border border-rose-100 dark:border-rose-500/30"
            label="Unrealized" value={<span className={posNeg(stats.unrealizedPL)}>{stats.unrealizedPL >= 0 ? '+' : '-'}{rs0(Math.abs(stats.unrealizedPL))}</span>} sub={spct(stats.unrealizedPLPercent)} />
        </Strip>
      </div>

      {/* Strip B — capital */}
      <div className="animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        <Strip>
          <Cell icon={<DollarSign size={18} className="text-emerald-600 dark:text-emerald-400" />} wrap="bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30"
            label="Cost Basis" value={rs0(stats.totalCost)} sub={stats.reinvestedProfits > 0 ? `Reinvested ${rs0(stats.reinvestedProfits)}` : undefined} />
          <Cell icon={<BarChart3 size={18} className="text-teal-600 dark:text-teal-400" />} wrap="bg-teal-50 dark:bg-teal-500/20 border border-teal-100 dark:border-teal-500/30"
            label="Stock Value" value={rs0(stats.totalValue)} />
          <Cell icon={<Landmark size={18} className="text-blue-600 dark:text-blue-400" />} wrap="bg-blue-50 dark:bg-blue-500/20 border border-blue-100 dark:border-blue-500/30"
            label="Free Cash" value={<span className={stats.freeCash < 0 ? 'text-rose-500 dark:text-rose-400' : ''}>{rs0(stats.freeCash)}</span>} />
          <Cell icon={<Scale size={18} className="text-indigo-600 dark:text-indigo-400" />} wrap="bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-500/30"
            label="Net Invested" value={rs0(stats.netPrincipal)} />
          <Cell icon={<History size={18} className="text-slate-500 dark:text-slate-400" />} wrap="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            label="Peak Capital" value={rs0(stats.peakNetPrincipal)} />
        </Strip>
      </div>

      {/* Costs + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 animate-fade-in-up" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
            {[
              { label: 'Commission', v: stats.totalCommission, icon: <Receipt size={16} className="text-blue-600 dark:text-blue-400" />, wrap: 'bg-blue-50 dark:bg-blue-500/20 border border-blue-100 dark:border-blue-500/30' },
              { label: 'Taxes (SST)', v: stats.totalSalesTax, icon: <Building2 size={16} className="text-purple-600 dark:text-purple-400" />, wrap: 'bg-purple-50 dark:bg-purple-500/20 border border-purple-100 dark:border-purple-500/30' },
              { label: 'CDC Charges', v: stats.totalCDC, icon: <FileText size={16} className="text-orange-600 dark:text-orange-400" />, wrap: 'bg-orange-50 dark:bg-orange-500/20 border border-orange-100 dark:border-orange-500/30' },
              { label: 'Total CGT', v: stats.totalCGT, icon: <PiggyBank size={16} className="text-rose-500 dark:text-rose-400" />, wrap: 'bg-rose-50 dark:bg-rose-500/20 border border-rose-100 dark:border-rose-500/30' },
              { label: 'Other Fees', v: stats.totalOtherFees, icon: <Stamp size={16} className="text-slate-500 dark:text-slate-400" />, wrap: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700' },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 rounded-2xl transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${c.wrap}`}>{c.icon}</div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{c.label}</div>
                  <div className="text-base font-display font-black tracking-tight tabular-nums text-slate-800 dark:text-slate-100 mt-0.5">{rs0(c.v)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6 flex items-center gap-5 transition-transform hover:-translate-y-1 duration-300">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30 flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck size={26} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center">
                Health <HealthPopover pillars={H.pillars} score={H.score} />
              </span>
              <span className={`text-[11px] font-black uppercase tracking-wider ${H.text}`}>{H.label}</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tighter">{H.score}</span>
              <span className="text-sm text-slate-400 font-bold">/100</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800/80 rounded-full mt-2.5 overflow-hidden shadow-inner">
              <div className={`h-full rounded-full ${H.bar} transition-all duration-1000 ease-out`} style={{ width: `${H.score}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
