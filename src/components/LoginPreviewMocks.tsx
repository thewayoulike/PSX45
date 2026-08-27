import React from 'react';
import { Wallet, ShieldCheck, Building2, TrendingUp, Activity, Coins } from 'lucide-react';

// A self-contained dashboard preview (no screenshot needed) — mirrors the real
// dashboard's cards with a strong, positive example for the landing page.
const Spark: React.FC<{ points: string }> = ({ points }) => (
  <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-6 mt-2">
    <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

const StatCard: React.FC<{ label: string; value: string; sub: string; Icon: any; points: string }> = ({ label, value, sub, Icon, points }) => {
  const pts = points.trim().split(/\s+/);
  const area = `M${pts[0]} ${pts.slice(1).map(p => 'L' + p).join(' ')} L100,26 L0,26 Z`;
  const gid = 'g' + label.replace(/[^a-z]/gi, '');
  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
          <div className="text-lg sm:text-2xl font-display font-black text-slate-900 dark:text-white tabular-nums mt-1">{value}</div>
          <div className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{sub}</div>
        </div>
        <div className="w-8 h-8 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center shrink-0"><Icon size={15} /></div>
      </div>
      <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-8 mt-2">
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity="0.28" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill={`url(#${gid})`} />
        <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const GroupCard: React.FC<{ title: string; Icon: any; tint: string; tiles: { label: string; value: string; sub?: string; color?: string }[] }> = ({ title, Icon, tint, tiles }) => (
  <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
    <div className="flex items-center gap-2 mb-3">
      <Icon size={15} className={tint} />
      <span className={`text-[10px] font-black uppercase tracking-widest ${tint}`}>{title}</span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {tiles.map(t => (
        <div key={t.label} className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-2.5">
          <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400">{t.label}</div>
          <div className={`text-sm font-display font-black tabular-nums mt-0.5 ${t.color || 'text-slate-900 dark:text-white'}`}>{t.value}</div>
          {t.sub && <div className="text-[8px] text-slate-400 mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 ${className || ''}`}>
    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{title}</div>
    {children}
  </div>
);

const Row: React.FC<{ left: React.ReactNode; right: string; up?: boolean }> = ({ left, right, up = true }) => (
  <div className="flex items-center justify-between gap-2 py-0.5">
    <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">{left}</span>
    <span className={`text-[11px] sm:text-sm font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{right}</span>
  </div>
);

export const DashboardShot: React.FC = () => (
  <div className="relative w-full mt-4 text-left">
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
      {/* browser chrome */}
      <div className="h-9 flex items-center gap-1.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] text-slate-400 font-mono">psx-tracker.com</span>
      </div>

      {/* dashboard body */}
      <div className="p-4 sm:p-6 bg-slate-50 dark:bg-[#0a0a0a] space-y-3">
        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg sm:text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Welcome back 👋</div>
            <div className="text-[10px] sm:text-xs text-slate-400">Here's how your investments are performing today.</div>
          </div>
          <span className="hidden sm:inline text-[10px] font-bold text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1">Updated 9:42 AM</span>
        </div>

        {/* hero stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Total Net Worth" value="Rs. 1,247,850.40" sub="Invested Rs. 1,085,200.00" Icon={Wallet} points="0,20 16,17 32,19 48,11 64,13 80,6 100,3" />
          <StatCard label="Total Return" value="+14.99%" sub="+Rs. 162,650.40" Icon={TrendingUp} points="0,22 16,19 32,16 48,15 64,9 80,7 100,2" />
          <StatCard label="Today's P&L" value="+Rs. 8,420.75" sub="+0.68%" Icon={Activity} points="0,18 16,20 32,12 48,15 64,10 80,12 100,5" />
        </div>

        {/* performance / capital / income */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <GroupCard title="Performance" Icon={TrendingUp} tint="text-emerald-600 dark:text-emerald-400" tiles={[
            { label: 'MWR (XIRR)', value: '+19.40%', sub: 'Annualized', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'ROI', value: '+14.99%', sub: 'Incl. dividends', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Realized Gain', value: '+Rs. 84,250.40', sub: 'All time', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Unrealized Gain', value: '+Rs. 78,400.00', sub: 'Current open', color: 'text-emerald-600 dark:text-emerald-400' },
          ]} />
          <GroupCard title="Capital" Icon={Building2} tint="text-blue-600 dark:text-blue-400" tiles={[
            { label: 'Net Invested', value: 'Rs. 1,085,200.00', sub: 'Peak Rs. 1,085,200.00' },
            { label: 'Cost Basis', value: 'Rs. 1,012,450.25' },
            { label: 'Stock Value', value: 'Rs. 1,090,850.25', sub: 'Current mkt' },
            { label: 'Cash Balance', value: 'Rs. 157,000.15', sub: 'Available' },
          ]} />
          <GroupCard title="Income" Icon={Coins} tint="text-violet-600 dark:text-violet-400" tiles={[
            { label: 'Dividends', value: '+Rs. 12,480.00', sub: 'Tax Rs. 2,184.00', color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Dividend Yield', value: '1.15%', sub: 'Yield on cost', color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Total P&L', value: '+Rs. 162,650.40', sub: 'Net profit', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Total CGT', value: 'Rs. 8,070.25', sub: 'Capital gains tax' },
          ]} />
        </div>

        {/* fees + health strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          {[['Commission', 'Rs. 14,280.50'], ['Taxes (SST)', 'Rs. 2,142.08'], ['CDC Charges', 'Rs. 890.40'], ['Other Fees', 'Rs. 125.00']].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm">
              <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400">{k}</div>
              <div className="text-[11px] sm:text-sm font-display font-black text-slate-800 dark:text-white tabular-nums mt-0.5">{v}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-emerald-500" /><span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400">Health Score</span></div>
            <div className="text-[11px] sm:text-sm font-display font-black text-slate-800 dark:text-white tabular-nums mt-0.5">78<span className="text-slate-400 text-[10px]">/100</span> · <span className="text-emerald-600 dark:text-emerald-400">Great</span></div>
            <div className="h-1.5 mt-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} /></div>
          </div>
        </div>

        {/* Performance vs Index panel */}
        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Performance vs Index</div>
              <div className="text-[9px] text-slate-400">Last updated Aug 17, 6:27 PM</div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <span className="text-[10px] font-bold text-slate-500 px-2 py-1 rounded-lg">Today</span>
              <span className="text-[10px] font-bold text-slate-500 px-2 py-1 rounded-lg">1 Week</span>
              <span className="text-[10px] font-bold text-white bg-emerald-600 px-2 py-1 rounded-lg">1 Month</span>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-3 py-2 text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> Ahead of KSE-100 by 5.28% this month
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[['Your Portfolio', '+8.40%', 'text-emerald-600 dark:text-emerald-400'], ['KSE-100', '+3.12%', 'text-slate-700 dark:text-slate-200'], ['KMI-30', '+3.48%', 'text-slate-700 dark:text-slate-200'], ['Outperformance', '+5.28%', 'text-emerald-600 dark:text-emerald-400']].map(([k, v, c]) => (
              <div key={k} className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-2.5">
                <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 truncate">{k}</div>
                <div className={`text-sm font-display font-black tabular-nums mt-0.5 ${c}`}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* allocation + top holdings */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Panel title="Allocation">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shrink-0" style={{ background: 'conic-gradient(#10b981 0 32%, #6366f1 32% 56%, #f59e0b 56% 74%, #06b6d4 74% 88%, #f43f5e 88% 100%)' }}>
                <div className="absolute inset-[24%] rounded-full bg-white dark:bg-slate-900" />
              </div>
              <div className="space-y-1 text-[10px] sm:text-xs">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Banks 32%</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Tech 24%</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Cement 18%</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Energy 14%</div>
              </div>
            </div>
          </Panel>
          <Panel title="Top Holdings">
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">LUCK · 18%</span>} right="+22.4%" />
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">MEBL · 15%</span>} right="+18.1%" />
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">HUBC · 12%</span>} right="+11.6%" />
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">OGDC · 9%</span>} right="+6.8%" />
          </Panel>
        </div>

        {/* top movers + board meetings */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Panel title="Top Movers · KSE-100">
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">TRG</span>} right="+7.5%" />
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">PPL</span>} right="+5.1%" />
            <Row left={<span className="font-bold text-slate-700 dark:text-slate-200">HUBC</span>} right="+4.3%" />
          </Panel>
          <Panel title="Board Meetings">
            <Row left={<span><span className="font-bold text-slate-700 dark:text-slate-200">ENGRO</span> · Karachi</span>} right="in 2d" up />
            <Row left={<span><span className="font-bold text-slate-700 dark:text-slate-200">FFC</span> · Rawalpindi</span>} right="in 4d" up />
            <Row left={<span><span className="font-bold text-slate-700 dark:text-slate-200">MARI</span> · Islamabad</span>} right="in 6d" up />
          </Panel>
        </div>
      </div>
    </div>
  </div>
);

const KpiMini: React.FC<{ label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'neutral' }> = ({ label, value, sub, tone = 'neutral' }) => (
  <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-2.5 sm:p-3 shadow-sm min-w-0">
    <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</div>
    <div className={`text-[11px] sm:text-sm font-display font-black tabular-nums mt-0.5 ${tone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'down' ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>{value}</div>
    {sub && <div className="text-[8px] text-slate-400 mt-0.5 truncate">{sub}</div>}
  </div>
);

export const RealizedShot: React.FC = () => (
  <div className="relative w-full mt-4 text-left">
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
      <div className="h-9 flex items-center gap-1.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] text-slate-400 font-mono">psx-tracker.com/realized</span>
      </div>

      <div className="p-4 sm:p-6 bg-slate-50 dark:bg-[#0a0a0a] space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg sm:text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Realized P&amp;L</div>
            <div className="text-[10px] sm:text-xs text-slate-400">Track closed positions, CGT, and win rate — not just open holdings.</div>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1">SOLD POSITIONS: 24 / 24</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['This month', 'This year', 'Last 30d', 'All time'].map((p, i) => (
            <span key={p} className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${i === 3 ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'}`}>{p}</span>
          ))}
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white ml-1">All</span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800">Winners</span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800">Losers</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <KpiMini label="Total Realized P&L" value="Rs. 84,250.40" sub="+7.76%" tone="up" />
          <KpiMini label="Net After CGT" value="Rs. 76,180.15" sub="CGT −Rs. 8,070.25" />
          <KpiMini label="Total Trades" value="24" sub="Closed positions" />
          <KpiMini label="Winning Trades" value="14 (58.3%)" tone="up" />
          <KpiMini label="Losing Trades" value="10 (41.7%)" tone="down" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <KpiMini label="Average Profit" value="Rs. 9,420.50" tone="up" />
          <KpiMini label="Average Loss" value="Rs. −4,180.30" tone="down" />
          <KpiMini label="Profit Factor" value="2.14" sub="gross win ÷ gross loss" />
          <KpiMini label="Expectancy / Trade" value="+Rs. 3,510.43" sub="avg P&L per trade" tone="up" />
          <KpiMini label="Win / Loss Ratio" value="2.25" sub="avg win ÷ avg loss" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">P&amp;L over time</div>
            <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-16">
              <defs><linearGradient id="rpl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity="0.3" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></linearGradient></defs>
              <path d="M0,28 L12,26 L24,22 L36,24 L48,16 L60,14 L72,10 L84,12 L100,6 L100,36 L0,36 Z" fill="url(#rpl)" />
              <polyline points="0,28 12,26 24,22 36,24 48,16 60,14 72,10 84,12 100,6" fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">P&amp;L by month</div>
            <div className="flex items-end gap-1 h-16 px-1">
              {[40, 18, 8, 55, 28, 35].map((h, i) => (
                <div key={i} className={`flex-1 rounded-t ${i === 1 ? 'bg-rose-400' : 'bg-emerald-500'}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-full shrink-0" style={{ background: 'conic-gradient(#10b981 0 34%, #6366f1 34% 56%, #f59e0b 56% 74.5%, #06b6d4 74.5% 87.5%, #94a3b8 87.5% 100%)' }}>
              <div className="absolute inset-[28%] rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                <span className="text-[8px] font-black text-slate-700 dark:text-slate-200">84k</span>
              </div>
            </div>
            <div className="text-[9px] space-y-0.5 text-slate-500 dark:text-slate-400">
              <div>LUCK 34.0%</div>
              <div>MEBL 22.0%</div>
              <div>HUBC 18.5%</div>
              <div>OGDC 13.0%</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">2026 heatmap</div>
          <div className="grid grid-cols-12 gap-1">
            {[
              { m: 'J', v: null }, { m: 'F', v: null }, { m: 'M', v: null },
              { m: 'A', v: 12400 }, { m: 'M', v: -8200 }, { m: 'J', v: 18650 },
              { m: 'J', v: 22100 }, { m: 'A', v: 15800 }, { m: 'S', v: null },
              { m: 'O', v: null }, { m: 'N', v: null }, { m: 'D', v: null },
            ].map((c) => (
              <div key={c.m} className={`rounded-md text-center py-1.5 ${c.v == null ? 'bg-slate-100 dark:bg-slate-800' : c.v < 0 ? 'bg-rose-100 dark:bg-rose-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20'}`}>
                <div className="text-[8px] font-bold text-slate-400">{c.m}</div>
                {c.v != null && <div className={`text-[8px] font-black tabular-nums ${c.v < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{c.v < 0 ? '−8.2K' : `${Math.round(c.v / 1000)}K`}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] sm:text-[10px]">
              <thead>
                <tr className="text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  {['Date', 'Ticker', 'Qty', 'Buy avg', 'Sell', 'P&L %', 'Net profit'].map(h => (
                    <th key={h} className="text-left font-bold px-2 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="px-2 py-2">2026-08-12</td>
                  <td className="px-2 py-2 font-black text-slate-800 dark:text-white">LUCK</td>
                  <td className="px-2 py-2">150</td>
                  <td className="px-2 py-2">780.00</td>
                  <td className="px-2 py-2">920.00</td>
                  <td className="px-2 py-2 font-bold text-emerald-600">+17.95%</td>
                  <td className="px-2 py-2 font-black text-emerald-600">+21,000.00</td>
                </tr>
                <tr className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="px-2 py-2">2026-07-21</td>
                  <td className="px-2 py-2 font-black text-slate-800 dark:text-white">MEBL</td>
                  <td className="px-2 py-2">400</td>
                  <td className="px-2 py-2">248.50</td>
                  <td className="px-2 py-2">271.20</td>
                  <td className="px-2 py-2 font-bold text-emerald-600">+9.13%</td>
                  <td className="px-2 py-2 font-black text-emerald-600">+9,080.00</td>
                </tr>
                <tr>
                  <td className="px-2 py-2">2026-06-09</td>
                  <td className="px-2 py-2 font-black text-slate-800 dark:text-white">HUBC</td>
                  <td className="px-2 py-2">800</td>
                  <td className="px-2 py-2">142.10</td>
                  <td className="px-2 py-2">136.40</td>
                  <td className="px-2 py-2 font-bold text-rose-500">−4.01%</td>
                  <td className="px-2 py-2 font-black text-rose-500">−4,560.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
);
