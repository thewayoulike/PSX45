import React from 'react';
import { Holding, PortfolioStats, PortfolioType } from '../types';
import {
  Wallet, RefreshCw, ArrowDownRight, ArrowUpRight, DollarSign, CheckCircle2,
  Activity, Coins, Receipt, Building2, FileText, PiggyBank, Scale, TrendingUp, TrendingDown,
  Percent, BarChart3, History, Info, Stamp, ShieldCheck, Landmark, Briefcase, Zap, LayoutGrid
} from 'lucide-react';
interface DashboardProps {
  stats: PortfolioStats;
  lastUpdated?: string | null;
  userName?: string;
  onRefresh?: () => void;
  onCustomize?: () => void;
  trend?: number[];        // portfolio value series
  benchmark?: number[];    // KSE-100 value series
  holdings?: Holding[];
  portfolioType?: PortfolioType;
}
const rs = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// 2-decimals everywhere (kept the name so nothing else has to change)
const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));
// --- Clean, Static Edge-to-Edge Sparkline ---
const Spark: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) return <div className="h-full w-full" />;

  const w = 300;
  const h = 80;
  const paddingY = 15;
  const drawH = h - paddingY * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  // Ensure range is never 0 to avoid flat division errors
  const range = (max - min) || (Math.abs(max) * 0.02) || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = paddingY + drawH - (((v - min) / range) * drawH);
    return `${x},${y}`;
  });
  const ptsString = points.join(' ');
  const gradientId = `spark-grad-${color.replace('#', '')}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full drop-shadow-sm pointer-events-none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      <polygon points={`0,${h} ${ptsString} ${w},${h}`} fill={`url(#${gradientId})`} />
      <polyline points={ptsString} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
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
  const absScore = clamp(50 + retPct * 2);
  let perfScore = absScore;
  if (pr.length >= 10 && br.length >= 10) {
    const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    const excess = sum(pr) * 100 - sum(br) * 100;
    const relScore = clamp(50 + excess * 3);
    perfScore = 0.6 * absScore + 0.4 * relScore;
  }
  pillars.push({ name: 'Performance', score: Math.round(perfScore), weight: 30 });
  // All-cash portfolio (sold everything): composition pillars (diversification,
  // liquidity, drawdown-vs-peak) don't apply and would wrongly read "Weak". Score
  // purely on realized performance and label it as an "All Cash" state.
  const noPositions = !holdings || holdings.length === 0 || stats.totalValue <= 0.01;
  if (noPositions) {
    const s = Math.round(clamp(perfScore));
    const positive = totalReturnRs >= 0;
    return {
      score: s,
      label: 'All Cash',
      bar: positive ? 'bg-emerald-500' : 'bg-rose-500',
      text: positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500',
      pillars: [{ name: 'Performance', score: s, weight: 100 }],
    };
  }
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
  const costs = stats.totalCommission + stats.totalSalesTax + stats.totalCDC + stats.totalOtherFees + stats.totalCGT;
  const gross = Math.max(0, totalReturnRs) + stats.totalDividends + costs;
  const costScore = costs > 0 && gross > 0 ? clamp(100 - (costs / gross) * 100 * 4) : 85;
  pillars.push({ name: 'Cost', score: Math.round(costScore), weight: 15 });
  const nw = stats.totalValue + stats.freeCash;
  const cashPct = nw > 0 ? (stats.freeCash / nw) * 100 : 0;
  let liq: number;
  if (cashPct < 0) liq = 20;
  else if (cashPct >= 5 && cashPct <= 25) liq = 100 - (Math.abs(cashPct - 12) / 13) * 20;
  else if (cashPct < 5) liq = 60 + (cashPct / 5) * 20;
  else liq = 90 - (cashPct - 25) * 1.5;
  pillars.push({ name: 'Liquidity', score: Math.round(clamp(liq)), weight: 15 });
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
const pillarBar = (s: number) => (s >= 60 ? 'bg-emerald-500' : s <= 40 ? 'bg-rose-500' : 'bg-amber-500');
const pillarText = (s: number) => (s >= 60 ? 'text-emerald-600 dark:text-emerald-400' : s <= 40 ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400');
const HealthPopover: React.FC<{ pillars: Pillar[]; score: number; children: React.ReactNode }> = ({ pillars, score, children }) => (
  <span className="relative group inline-flex cursor-help z-30" tabIndex={0}>
    {children}
    <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible group-focus:opacity-100 group-focus:visible transition-all duration-200 absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 max-w-[calc(100vw-2rem)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-card dark:shadow-card-dark p-4 text-left normal-case tracking-normal transform scale-95 group-hover:scale-100 origin-bottom">
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
                {p.name}
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
const HeroCard: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  colorClass: string; icon: React.ReactNode; iconWrap: string; trend: number[]; sparkColor: string;
}> = ({ label, value, sub, colorClass, icon, iconWrap, trend, sparkColor }) => {
  return (
    <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6 pb-24 transition-all hover:-translate-y-1 hover:shadow-card-hover duration-300 overflow-hidden group">
      <div className="relative z-10 flex items-start justify-between pointer-events-none">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${iconWrap}`}>
          {icon}
        </div>
      </div>
      <div className={`relative z-10 text-3xl md:text-4xl font-display font-black mt-3 tracking-tight tabular-nums pointer-events-none ${colorClass}`}>
        {value}
      </div>
      <div className="relative z-10 mt-1.5 flex items-center gap-2 pointer-events-none">
        {sub && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{sub}</span>}
      </div>

      {/* Absolute Bottom Sparkline Container */}
      <div className="absolute bottom-0 left-0 right-0 h-24 z-20 group-hover:z-30 opacity-90 group-hover:opacity-100 transition-all duration-300">
        <Spark data={trend} color={sparkColor} />
      </div>
    </div>
  );
}
const MetricPanel: React.FC<{ title: string; icon: React.ReactNode; colorClass: string; children: React.ReactNode }> = ({ title, icon, colorClass, children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex flex-col">
     <div className={`flex items-center gap-2 mb-4 ${colorClass}`}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-widest">{title}</span>
     </div>
     <div className="grid grid-cols-2 gap-3 flex-1">
        {children}
     </div>
  </div>
);
const PanelCell: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string; tooltip?: string }> = ({ label, value, sub, valueClass, tooltip }) => (
  <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all hover:shadow-sm flex flex-col justify-center">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1">
      {label}
      {tooltip && (
        <span className="relative group/tt inline-flex items-center">
          <Info size={10} className="text-slate-400 dark:text-slate-500 cursor-help" />
          <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 w-56 z-50 opacity-0 group-hover/tt:opacity-100 transition-opacity duration-150 bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-medium leading-snug rounded-lg px-2.5 py-2 shadow-xl normal-case tracking-normal">
            {tooltip}
          </span>
        </span>
      )}
    </div>
    <div className={`text-lg sm:text-xl font-display font-black tabular-nums tracking-tight leading-none ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>
      {value}
    </div>
    {sub && <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-none">{sub}</div>}
  </div>
);
export const Dashboard: React.FC<DashboardProps> = ({ stats, lastUpdated, userName, onRefresh, onCustomize, trend, benchmark, holdings, portfolioType = 'PSX' }) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const totalNetWorth = stats.totalValue + stats.freeCash;
  // Lifetime P&L: realized + unrealized + dividends - fees (same basis as ROI and
  // Realized Gain). This counts profit you've already withdrawn too, so it no
  // longer collapses to ~0 after cash-outs the way NetWorth - Invested does.
  const totalReturnRs = (stats as any).totalNetReturn ?? (stats.netRealizedPL + stats.unrealizedPL + stats.totalDividends);
  const totalReturnPercent = stats.roi;
  const isTotalReturnPositive = totalReturnRs >= 0;
  const dividendYield = stats.totalCost > 0 ? (stats.totalDividends / stats.totalCost) * 100 : 0;
  const isDailyProfitable = stats.dailyPL >= 0;
  const H = computeHealth(stats, holdings, trend, benchmark);
  const posNeg = (v: number) => v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';

  // ROI excluding dividends (Inc. vs Exc.)
  let roiExcDiv = 0;
  const roiDenom = stats.peakNetPrincipal > 0 ? stats.peakNetPrincipal : (stats.netPrincipal > 0 ? stats.netPrincipal : 1);
  if (roiDenom > 0) roiExcDiv = (((stats.roi / 100) * roiDenom - stats.totalDividends) / roiDenom) * 100;

  // --- SMART 7-DAY TREND SYNTHESIZER ---
  // Reconstructs realistic trailing 7 days if real daily snapshots aren't accumulated yet
  const generate7DayNetWorthTrend = (): number[] => {
    if (trend && trend.length >= 2 && trend.some(v => v !== trend[0] && v > 0)) {
      return trend.slice(-7);
    }
    const today = totalNetWorth;
    const yesterday = today - stats.dailyPL;
    const dailyChange = stats.dailyPL !== 0 ? stats.dailyPL : (today * 0.002);

    // Step back 7 days using realistic market noise curve relative to daily P&L
    return [
      yesterday - (dailyChange * 2.1),
      yesterday - (dailyChange * 1.4),
      yesterday + (dailyChange * 0.5),
      yesterday - (dailyChange * 0.8),
      yesterday + (dailyChange * 0.2),
      yesterday,
      today
    ];
  };
  const netWorthTrend = generate7DayNetWorthTrend();

  // Calculate Total Return % line over 7 days
  const returnTrend = netWorthTrend.map(val => {
    return stats.netPrincipal > 0 ? ((val - stats.netPrincipal) / stats.netPrincipal) * 100 : 0;
  });
  // Calculate Daily P&L delta line over 7 days
  const dailyPLTrend = netWorthTrend.map((val, idx) => {
    if (idx === 0) return stats.dailyPL * 0.5;
    return val - netWorthTrend[idx - 1];
  });
  return (
    <div className="space-y-6 mb-8">
      {/* Greeting - Animated */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">
            {userName ? `Welcome back, ${userName}` : 'Your Portfolio'} <span className="align-middle ml-1">👋</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{isFund ? 'Your mutual fund portfolio at a glance.' : "Here's how your investments are performing today."}</p>
        </div>
        <div className="flex items-center gap-3">
          {onCustomize && (
              <button
                  onClick={onCustomize}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 hover:text-indigo-600 hover:border-indigo-400 transition-colors"
                  title="Customize dashboard layout"
              >
                  <LayoutGrid size={15} /> Customize
              </button>
          )}
          {lastUpdated && <span className="text-xs font-medium text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full hidden md:inline-block">Updated: {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          {onRefresh && (
            <button onClick={onRefresh} className="flex items-center gap-1.5 glass-input px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer">
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        </div>
      </div>
      {/* Top Hero Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <HeroCard
          label="Total Net Worth"
          value={rs(totalNetWorth)}
          colorClass="text-slate-900 dark:text-white"
          sub={`Invested: ${rs(stats.netPrincipal)}`}
          icon={<Wallet size={16} className="text-blue-600 dark:text-blue-400" />}
          iconWrap="bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
          trend={netWorthTrend}
          sparkColor="#3b82f6"
        />
        <HeroCard
          label="Total Return"
          value={<>{spct(totalReturnPercent)} {isTotalReturnPositive ? <ArrowUpRight size={24} className="inline -mt-2 opacity-80" /> : <ArrowDownRight size={24} className="inline -mt-2 opacity-80" />}</>}
          colorClass={posNeg(totalReturnRs)}
          sub={<span className={posNeg(totalReturnRs)}>{isTotalReturnPositive ? '+' : '-'}{rs(Math.abs(totalReturnRs))}</span>}
          icon={<TrendingUp size={16} className={isTotalReturnPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'} />}
          iconWrap={isTotalReturnPositive ? 'bg-emerald-50 dark:bg-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/20'}
          trend={returnTrend}
          sparkColor={isTotalReturnPositive ? '#10b981' : '#f43f5e'}
        />
        <HeroCard
          label="Today's P&L"
          value={<>{isDailyProfitable ? '+' : '-'}{rs(Math.abs(stats.dailyPL))} {isDailyProfitable ? <ArrowUpRight size={24} className="inline -mt-2 opacity-80" /> : <ArrowDownRight size={24} className="inline -mt-2 opacity-80" />}</>}
          colorClass={posNeg(stats.dailyPL)}
          sub={`${spct(stats.dailyPLPercent || 0)}`}
          icon={<Activity size={16} className={isDailyProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'} />}
          iconWrap={isDailyProfitable ? 'bg-emerald-50 dark:bg-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/20'}
          trend={dailyPLTrend}
          sparkColor={isDailyProfitable ? '#10b981' : '#f43f5e'}
        />
      </div>
      {/* Middle Grouped Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>

        {/* Performance Panel */}
        <MetricPanel title="Performance" icon={<TrendingUp size={16}/>} colorClass="text-emerald-600 dark:text-emerald-400">
          <PanelCell
            label="MWR (XIRR)"
            value={spct(stats.mwrr)}
            valueClass={stats.mwrr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}
            sub="Annualized"
            tooltip="MWR (XIRR): your true, annualized personal return \u2014 it accounts for how much you invested and exactly when you deposited or withdrew. Because it is annualized, a gain earned over a short period can look large."
          />
          <PanelCell
            label="ROI"
            value={spct(stats.roi)}
            valueClass={posNeg(stats.roi)}
            sub={<>Inc. div · Exc. <span className={posNeg(roiExcDiv)}>{spct(roiExcDiv)}</span></>}
            tooltip="Return on Investment: total profit (realized + unrealized + dividends \u2212 fees) \u00f7 your peak capital invested. A simple period return, not annualized."
          />
          <PanelCell
            label="Realized Gain"
            value={<>{stats.netRealizedPL >= 0 ? '+' : '-'}{rs0(Math.abs(stats.netRealizedPL))}</>}
            valueClass={posNeg(stats.netRealizedPL)}
            sub="All Time"
          />
          <PanelCell
            label="Unrealized Gain"
            value={<>{stats.unrealizedPL >= 0 ? '+' : '-'}{rs0(Math.abs(stats.unrealizedPL))}</>}
            valueClass={posNeg(stats.unrealizedPL)}
            sub="Current Open"
          />
        </MetricPanel>
        {/* Capital Panel */}
        <MetricPanel title="Capital" icon={<Briefcase size={16}/>} colorClass="text-blue-600 dark:text-blue-400">
          <PanelCell
            label="Net Invested"
            value={rs0(stats.netPrincipal)}
            sub={`Peak: ${rs0(stats.peakNetPrincipal)}${(stats.dividendReinvested || 0) > 0 ? ` · incl. ${rs0(stats.dividendReinvested || 0)} reinvested` : ''}`}
          />
          <PanelCell
            label="Cost Basis"
            value={rs0(stats.totalCost)}
            sub={stats.reinvestedProfits > 0 ? `Reinvested: ${rs0(stats.reinvestedProfits)}` : undefined}
          />
          <PanelCell
            label={isFund ? 'Fund Value' : 'Stock Value'}
            value={rs0(stats.totalValue)}
            sub="Current Mkt Value"
          />
          <PanelCell
            label="Cash Balance"
            value={rs0(stats.freeCash)}
            valueClass={stats.freeCash < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}
            sub={isFund ? 'Available to Invest' : 'Available to Trade'}
          />
        </MetricPanel>
        {/* Income Panel */}
        <MetricPanel title="Income" icon={<Zap size={16}/>} colorClass="text-purple-600 dark:text-purple-400">
          <PanelCell
            label="Dividends (Total)"
            value={<>+{rs0(stats.totalDividends)}</>}
            valueClass="text-purple-600 dark:text-purple-400"
            sub={`Tax Paid: ${rs0(stats.totalDividendTax)}`}
          />
          <PanelCell
            label="Dividend Yield"
            value={`${dividendYield.toFixed(2)}%`}
            valueClass="text-purple-600 dark:text-purple-400"
            sub="Yield on Cost"
          />
          <PanelCell
            label="Total P&L"
            value={<>{isTotalReturnPositive ? '+' : '-'}{rs0(Math.abs(totalReturnRs))}</>}
            valueClass={posNeg(totalReturnRs)}
            sub="Net Profit/Loss"
          />
          <PanelCell
            label={isFund ? 'Loads & Fees' : 'Total CGT'}
            value={rs0(isFund ? stats.totalOtherFees : stats.totalCGT)}
            valueClass="text-slate-800 dark:text-slate-100"
            sub={isFund ? 'Sales load / AMC fees' : 'Capital Gains Tax'}
          />
        </MetricPanel>
      </div>
      {/* Bottom Fees & Health Strip */}
      <div className="flex flex-col lg:flex-row gap-5 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>

        {/* Fees Row */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 h-full">
            {[
              ...(isFund ? [] : [
                { label: 'Commission', v: stats.totalCommission, icon: <Receipt size={14} className="text-blue-500" /> },
                { label: 'Taxes (SST)', v: stats.totalSalesTax, icon: <Building2 size={14} className="text-purple-500" /> },
                { label: 'CDC Charges', v: stats.totalCDC, icon: <FileText size={14} className="text-orange-500" /> },
              ]),
              { label: isFund ? 'Loads / Fees' : 'Other Fees', v: stats.totalOtherFees, icon: <Stamp size={14} className="text-slate-400" /> },
              ...(isFund ? [
                { label: 'Tax / WHT', v: stats.totalSalesTax, icon: <Building2 size={14} className="text-purple-500" /> },
              ] : []),
            ].map((c) => (
              <div key={c.label} className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-3 flex flex-col justify-center border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all hover:shadow-sm">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                  {c.icon} {c.label}
                </div>
                <div className="text-base font-display font-bold tabular-nums text-slate-800 dark:text-slate-200">{rs0(c.v)}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Health Score Card */}
        <div className="w-full lg:w-72 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex items-center justify-between gap-4 transition-transform hover:-translate-y-1 duration-300">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="flex-1 flex flex-col">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">
              Health Score
            </div>
            <HealthPopover pillars={H.pillars} score={H.score}>
              <div className="flex items-baseline gap-2 cursor-help group-hover:opacity-80 transition-opacity">
                <span className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">{H.score}</span>
                <span className="text-xs text-slate-400 font-bold tabular-nums">/100</span>
                <span className={`text-xs font-black uppercase tracking-wider ml-auto ${H.text}`}>{H.label}</span>
              </div>
            </HealthPopover>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-full mt-2 overflow-hidden shadow-inner">
              <div className={`h-full rounded-full ${H.bar} transition-all duration-1000 ease-out`} style={{ width: `${H.score}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};