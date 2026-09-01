import React, { useState, useMemo, useEffect } from 'react';
import { RealizedTrade } from '../types';
import {
  Search, X, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronDown
} from 'lucide-react';
import { exportToExcel, exportToCSV } from '../utils/export';
import { formatAssetLabel } from '../utils/fundDisplay';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface FundRealizedViewProps {
  trades: RealizedTrade[];
  displayNames?: Record<string, string>;
  unrealizedPL: number;
}

type SortKey = keyof RealizedTrade | 'totalCost' | 'totalSell' | 'eventType';
type SortDirection = 'asc' | 'desc';
type ResultFilter = 'all' | 'win' | 'loss';
type FundTab = 'redemptions' | 'conversions' | 'all';
interface SortConfig { key: SortKey; direction: SortDirection; }

const f2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fK = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DONUT = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#94a3b8'];

const eventLabel = (t: RealizedTrade) => {
  if (t.eventType === 'convert') return 'Convert';
  if (t.eventType === 'history') return 'Prior P&L';
  if (t.eventType === 'redemption') return 'Redemption';
  return 'Redemption';
};

const eventBadgeClass = (t: RealizedTrade) => {
  if (t.eventType === 'convert') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border-blue-200/60 dark:border-blue-500/25';
  if (t.eventType === 'history') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/25';
};

const filterByTab = (trades: RealizedTrade[], tab: FundTab) => {
  if (tab === 'all') return trades;
  if (tab === 'conversions') return trades.filter(t => t.eventType === 'convert');
  return trades.filter(t => t.eventType !== 'convert');
};

const Ring: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" className="shrink-0">
      <circle cx="23" cy="23" r={r} fill="none" strokeWidth="5" className="stroke-slate-100 dark:stroke-slate-800" />
      <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)} transform="rotate(-90 23 23)" />
    </svg>
  );
};

const Spark: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return <div className="h-10" />;
  const w = 220, h = 40, min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const StatCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{label}</div>
    {children}
  </div>
);

const ChartCard: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, right, children }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
    <div className="flex items-center justify-between mb-1">
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="mt-2">{children}</div>
  </div>
);

export const FundRealizedView: React.FC<FundRealizedViewProps> = ({ trades, displayNames = {}, unrealizedPL }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState<ResultFilter>('all');
  const [fundTab, setFundTab] = useState<FundTab>('redemptions');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [timeMode, setTimeMode] = useState<'daily' | 'cumulative' | 'totalGain'>('cumulative');
  const [monthYear, setMonthYear] = useState<string>('');
  const [pieActive, setPieActive] = useState<number | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const tabTrades = useMemo(() => filterByTab(trades, fundTab), [trades, fundTab]);

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredAndSortedTrades = useMemo(() => {
    const filtered = tabTrades.filter(trade => {
      const term = searchTerm.toLowerCase();
      const assetLabel = formatAssetLabel(trade.ticker, displayNames).toLowerCase();
      const typeLabel = eventLabel(trade).toLowerCase();
      const matchesSearch = trade.ticker.toLowerCase().includes(term) || assetLabel.includes(term) || typeLabel.includes(term);
      const matchesFrom = dateFrom ? trade.date >= dateFrom : true;
      const matchesTo = dateTo ? trade.date <= dateTo : true;
      const matchesResult = result === 'all' ? true : result === 'win' ? trade.profit > 0 : trade.profit < 0;
      return matchesSearch && matchesFrom && matchesTo && matchesResult;
    });
    return filtered.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof RealizedTrade], bValue: any = b[sortConfig.key as keyof RealizedTrade];
      if (sortConfig.key === 'totalCost') { aValue = (a.buyAvg || 0) * a.quantity; bValue = (b.buyAvg || 0) * b.quantity; }
      else if (sortConfig.key === 'totalSell') { aValue = (a.sellPrice || 0) * a.quantity; bValue = (b.sellPrice || 0) * b.quantity; }
      else if (sortConfig.key === 'eventType') { aValue = eventLabel(a); bValue = eventLabel(b); }
      if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); bValue = bValue.toLowerCase(); }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tabTrades, searchTerm, dateFrom, dateTo, result, sortConfig, displayNames]);

  const summary = useMemo(() => {
    const t = filteredAndSortedTrades;
    const totalProfit = t.reduce((s, x) => s + x.profit, 0);
    const totalCost = t.reduce((s, x) => s + (x.buyAvg || 0) * x.quantity, 0);
    const totalPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
    const totalProceeds = t.reduce((s, x) => s + (x.sellPrice || 0) * x.quantity, 0);
    const redemptionTax = t.reduce((s, x) => s + (x.tax || 0), 0);
    const netAfterCgt = totalProfit - redemptionTax;
    const withHold = t.filter(x => x.holdDays != null && x.eventType !== 'history');
    const avgHoldDays = withHold.length ? withHold.reduce((s, x) => s + (x.holdDays || 0), 0) / withHold.length : 0;
    const wins = t.filter(x => x.profit > 0);
    const winRate = t.length ? (wins.length / t.length) * 100 : 0;

    const byDate: Record<string, number> = {};
    t.forEach(x => { byDate[x.date] = (byDate[x.date] || 0) + x.profit; });
    const dates = Object.keys(byDate).sort();
    let run = 0;
    const timeSeries = dates.map(d => {
      run += byDate[d];
      return {
        date: d.slice(5),
        daily: byDate[d],
        cumulative: run,
        totalGain: run + unrealizedPL,
      };
    });

    const byMonth: Record<string, number[]> = {};
    t.forEach(x => { const [y, m] = x.date.split('-'); (byMonth[y] ||= new Array(12).fill(0))[Number(m) - 1] += x.profit; });
    const years = Object.keys(byMonth).sort().reverse();
    let maxAbsMonth = 0;
    Object.values(byMonth).forEach(arr => arr.forEach(v => { if (Math.abs(v) > maxAbsMonth) maxAbsMonth = Math.abs(v); }));

    const byTicker: Record<string, number> = {};
    t.forEach(x => { const k = x.ticker === 'PREV-PNL' ? 'HISTORY' : x.ticker; byTicker[k] = (byTicker[k] || 0) + x.profit; });
    const tickerArr = Object.entries(byTicker).map(([name, v]) => ({ name, value: v })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const grossAbs = tickerArr.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
    const top = tickerArr.slice(0, 4).map(x => ({ name: x.name, value: x.value, mag: Math.abs(x.value) }));
    const others = tickerArr.slice(4);
    const othersMag = others.reduce((s, x) => s + Math.abs(x.value), 0);
    const othersNet = others.reduce((s, x) => s + x.value, 0);
    const donut = others.length ? [...top, { name: 'Others', value: othersNet, mag: othersMag }] : top;

    const redemptionRealized = filterByTab(trades, 'redemptions').reduce((s, x) => s + x.profit, 0);
    const totalGain = redemptionRealized + unrealizedPL;

    return {
      totalProfit, totalPct, count: t.length, totalProceeds, redemptionTax, netAfterCgt,
      avgHoldDays, winRate, wins: wins.length,
      timeSeries, byMonth, years, maxAbsMonth, donut, grossAbs, tickerAll: tickerArr,
      redemptionRealized, totalGain,
    };
  }, [filteredAndSortedTrades, unrealizedPL, trades]);

  useEffect(() => { if (summary.years.length && !summary.years.includes(monthYear)) setMonthYear(summary.years[0]); }, [summary.years, monthYear]);
  const monthYearEff = summary.years.includes(monthYear) ? monthYear : (summary.years[0] || '');

  const monthData = useMemo(() => {
    const arr = summary.byMonth[monthYearEff] || new Array(12).fill(0);
    return arr.map((v, i) => ({ month: MONTHS[i], value: v }));
  }, [summary.byMonth, monthYearEff]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFrom, dateTo, result, fundTab]);

  const totalPages = Math.ceil(filteredAndSortedTrades.length / itemsPerPage);
  const paginatedTrades = useMemo(() => { const start = (currentPage - 1) * itemsPerPage; return filteredAndSortedTrades.slice(start, start + itemsPerPage); }, [filteredAndSortedTrades, currentPage, itemsPerPage]);

  const totals = useMemo(() => filteredAndSortedTrades.reduce((acc, t) => {
    const cost = (t.buyAvg || 0) * t.quantity; const sell = (t.sellPrice || 0) * t.quantity;
    return { qty: acc.qty + t.quantity, cost: acc.cost + cost, sell: acc.sell + sell, tax: acc.tax + (t.tax || 0), profit: acc.profit + t.profit };
  }, { qty: 0, cost: 0, sell: 0, tax: 0, profit: 0 }), [filteredAndSortedTrades]);

  const hasActiveFilters = searchTerm || dateFrom || dateTo || result !== 'all';
  const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setResult('all'); };

  const iso = (d: Date) => d.toISOString().split('T')[0];
  const setPreset = (preset: 'all' | 'month' | 'year' | '30') => {
    const now = new Date();
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else if (preset === 'month') { setDateFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(iso(now)); }
    else if (preset === 'year') { setDateFrom(iso(new Date(now.getFullYear(), 0, 1))); setDateTo(iso(now)); }
    else { setDateFrom(iso(new Date(now.getTime() - 30 * 864e5))); setDateTo(iso(now)); }
  };

  const filterByTicker = (name: string) => setSearchTerm(name === 'HISTORY' ? 'PREV-PNL' : name);
  const filterByMonthIndex = (mi: number) => {
    if (mi < 0 || !monthYearEff) return;
    const mm = String(mi + 1).padStart(2, '0');
    const last = new Date(Number(monthYearEff), mi + 1, 0).getDate();
    setDateFrom(`${monthYearEff}-${mm}-01`);
    setDateTo(`${monthYearEff}-${mm}-${String(last).padStart(2, '0')}`);
  };

  const handleExport = (type: 'excel' | 'csv') => {
    const data = filteredAndSortedTrades.map(trade => {
      const totalCost = (trade.buyAvg || 0) * trade.quantity; const totalSell = (trade.sellPrice || 0) * trade.quantity;
      return {
        Date: trade.date,
        Fund: formatAssetLabel(trade.ticker, displayNames),
        Type: eventLabel(trade),
        Quantity: trade.quantity,
        'Cost NAV': trade.buyAvg,
        'Sell NAV': trade.sellPrice,
        'Total Cost': totalCost,
        Proceeds: totalSell,
        'P&L %': totalCost > 0 ? (trade.profit / totalCost) * 100 : 0,
        'Net P&L': trade.profit,
        Tax: trade.tax,
        'Hold Days': trade.holdDays ?? '',
      };
    });
    const filename = `Fund_Realized_Gains_${new Date().toISOString().split('T')[0]}`;
    if (type === 'excel') exportToExcel(data, filename); else exportToCSV(data, filename);
  };

  const SortIcon = ({ column }: { column: SortKey }) => { if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />; return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />; };
  const Th = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey?: SortKey, align?: 'left' | 'right' | 'center', className?: string }) => (
    <th className={`px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer select-none group hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors ${className}`} onClick={() => sortKey && handleSort(sortKey)}>
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>{label} {sortKey && <SortIcon column={sortKey} />}</div>
    </th>
  );

  const tip = {
    contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' },
    formatter: (v: number, name: string) => [`Rs. ${f0(v)}`, name === 'totalGain' ? 'Total gain' : name === 'cumulative' ? 'Realized' : 'P&L'] as [string, string],
  };
  const heatColor = (v: number) => {
    if (!v || summary.maxAbsMonth === 0) return 'rgba(148,163,184,0.08)';
    const op = 0.15 + 0.75 * (Math.abs(v) / summary.maxAbsMonth);
    return v >= 0 ? `rgba(16,185,129,${op})` : `rgba(244,63,94,${op})`;
  };
  const chip = (active: boolean) => `px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`;
  const tabBtn = (tab: FundTab, label: string) => (
    <button onClick={() => setFundTab(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${fundTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{label}</button>
  );

  const chartKey = timeMode === 'daily' ? 'daily' : timeMode === 'totalGain' ? 'totalGain' : 'cumulative';
  const chartStroke = timeMode === 'totalGain' ? '#3b82f6' : '#10b981';
  const chartGradId = timeMode === 'totalGain' ? 'fundTotalGain' : 'fundRealized';

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col xl:flex-row justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Realized Gains</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Redemptions, conversions, and gain booked on units sold</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-md border border-indigo-200/60 dark:border-indigo-500/20 font-bold uppercase tracking-widest">Mutual Funds</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60 tabular-nums">{filteredAndSortedTrades.length} / {trades.length}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow sm:w-56">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input type="text" placeholder="Search fund…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder-slate-400 shadow-sm transition-all" />
          </div>
          <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-3 py-2.5 shrink-0 shadow-sm">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none w-28 p-0" />
            <span className="text-slate-300 dark:text-slate-600">-</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none w-28 p-0" />
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="flex bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/60 p-1 shadow-sm">
              <button onClick={() => handleExport('excel')} className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors" title="Export Excel"><FileSpreadsheet size={16} /></button>
              <div className="w-[1px] bg-slate-200 dark:bg-slate-700 my-1 mx-0.5"></div>
              <button onClick={() => handleExport('csv')} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors" title="Export CSV"><FileText size={16} /></button>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-sm" title="Clear Filters"><X size={16} /></button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabBtn('redemptions', 'Redemptions')}
        {tabBtn('conversions', 'Conversions')}
        {tabBtn('all', 'All')}
        <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Period</span>
        <button onClick={() => setPreset('month')} className={chip(false)}>This month</button>
        <button onClick={() => setPreset('year')} className={chip(false)}>This year</button>
        <button onClick={() => setPreset('30')} className={chip(false)}>Last 30d</button>
        <button onClick={() => setPreset('all')} className={chip(!dateFrom && !dateTo)}>All time</button>
        <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Result</span>
        <button onClick={() => setResult('all')} className={chip(result === 'all')}>All</button>
        <button onClick={() => setResult('win')} className={chip(result === 'win')}>Gains</button>
        <button onClick={() => setResult('loss')} className={chip(result === 'loss')}>Losses</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Realized P&L">
          <div className="flex items-center gap-2">
            <span className={`text-xl font-black ${summary.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>Rs. {f0(summary.totalProfit)}</span>
            <span className={`text-[10px] font-bold ${summary.totalPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{summary.totalPct >= 0 ? '+' : ''}{summary.totalPct.toFixed(2)}%</span>
          </div>
          <div className="mt-1"><Spark data={summary.timeSeries.map(d => d.cumulative)} color={summary.totalProfit >= 0 ? '#10b981' : '#f43f5e'} /></div>
        </StatCard>
        <StatCard label="Net after CGT">
          <div className={`text-xl font-black ${summary.netAfterCgt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>Rs. {f0(summary.netAfterCgt)}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Redemption tax −Rs {f0(summary.redemptionTax)}</div>
        </StatCard>
        <StatCard label="Events">
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{summary.count}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">{fundTab === 'conversions' ? 'Conversions' : fundTab === 'all' ? 'All events' : 'Redemptions'}</div>
        </StatCard>
        <StatCard label="Proceeds">
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">Rs. {f0(summary.totalProceeds)}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Units × repurchase NAV</div>
        </StatCard>
        <StatCard label="Unrealized (paper)">
          <div className={`text-xl font-black ${unrealizedPL >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-500'}`}>Rs. {f0(unrealizedPL)}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Current holdings mark</div>
        </StatCard>
        <StatCard label="Total gain">
          <div className={`text-xl font-black ${summary.totalGain >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500'}`}>Rs. {f0(summary.totalGain)}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Redemptions + unrealized</div>
        </StatCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Avg holding period">
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">{summary.avgHoldDays > 0 ? `${Math.round(summary.avgHoldDays)}d` : '—'}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Buy lot → sell date</div>
        </StatCard>
        <StatCard label="Gain rate">
          <div className="flex items-center justify-between">
            <div><div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{summary.wins}</div><div className="text-[10px] font-bold text-slate-400">{summary.winRate.toFixed(0)}% gains</div></div>
            <Ring pct={summary.winRate} color="#10b981" />
          </div>
        </StatCard>
        <StatCard label="Avg return">
          <div className={`text-xl font-black ${summary.totalPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{summary.totalPct >= 0 ? '+' : ''}{summary.totalPct.toFixed(2)}%</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">On cost of sold units</div>
        </StatCard>
        <StatCard label="Redemption realized">
          <div className={`text-xl font-black ${summary.redemptionRealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>Rs. {f0(summary.redemptionRealized)}</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-1">Excludes conversions</div>
        </StatCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <ChartCard
          title="Gain over time"
          subtitle="Total gain adds today's unrealized to cumulative realized"
          right={
            <select value={timeMode} onChange={(e) => setTimeMode(e.target.value as any)} className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none dark:text-slate-200">
              <option value="daily">Daily realized</option>
              <option value="cumulative">Cumulative realized</option>
              <option value="totalGain">Total gain</option>
            </select>
          }
        >
          {summary.timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={summary.timeSeries} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id={chartGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartStroke} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={chartStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fK} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey={chartKey} stroke={chartStroke} strokeWidth={2} fill={`url(#${chartGradId})`} />
                {timeMode === 'cumulative' && unrealizedPL !== 0 && (
                  <Area type="monotone" dataKey="totalGain" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">No realized events in this view yet.</div>
          )}
          {timeMode === 'cumulative' && unrealizedPL !== 0 && (
            <div className="flex gap-4 justify-center mt-2 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Realized</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block border-dashed" style={{ borderTop: '1px dashed #3b82f6' }} /> + unrealized (today)</span>
            </div>
          )}
        </ChartCard>

        <ChartCard title="P&L by month" right={
          <select value={monthYearEff} onChange={(e) => setMonthYear(e.target.value)} className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none dark:text-slate-200">
            {summary.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        }>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthData} margin={{ top: 5, right: 5, left: -18, bottom: 0 }} onClick={(e: any) => e && e.activeLabel && filterByMonthIndex(MONTHS.indexOf(e.activeLabel))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fK} />
              <Tooltip {...tip} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} className="cursor-pointer">
                {monthData.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#10b981' : '#f43f5e'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="P&L by fund">
          <div className="flex items-center gap-3">
            <div className="relative w-[150px] h-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summary.donut} dataKey="mag" nameKey="name" innerRadius={46} outerRadius={66} paddingAngle={2} stroke="none"
                    onMouseEnter={(_: any, i: number) => setPieActive(i)} onMouseLeave={() => setPieActive(null)}
                    onClick={(d: any) => d && d.name && d.name !== 'Others' && filterByTicker(d.name)} className="cursor-pointer">
                    {summary.donut.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} opacity={pieActive == null || pieActive === i ? 1 : 0.3} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 text-center">
                {(() => {
                  const a = pieActive != null ? summary.donut[pieActive] : null;
                  const val = a ? a.value : summary.totalProfit;
                  return (<><span className={`text-sm font-black ${val >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-500'}`}>Rs. {fK(val)}</span><span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[104px]">{a ? a.name : 'Total'}</span></>);
                })()}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {summary.donut.filter(d => d.name !== 'Others').map((d, i) => (
                <button key={d.name} onClick={() => filterByTicker(d.name)} className="w-full flex items-center gap-2 text-xs hover:opacity-80 transition-opacity">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT[i % DONUT.length] }} />
                  <span className="font-semibold text-slate-600 dark:text-slate-300 flex-1 text-left truncate">{formatAssetLabel(d.name, displayNames)}</span>
                  <span className="font-bold text-slate-500 dark:text-slate-400 tabular-nums">{((d.mag / summary.grossAbs) * 100).toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {summary.years.length > 0 && (
        <ChartCard title="Monthly P&L heatmap">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
                <div />
                {MONTHS.map(m => <div key={m} className="text-[9px] font-bold uppercase text-slate-400 text-center">{m}</div>)}
              </div>
              {summary.years.map(y => (
                <div key={y} className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center">{y}</div>
                  {summary.byMonth[y].map((v, i) => (
                    <button key={i} onClick={() => { setMonthYear(y); filterByMonthIndex(i); }} title={`${MONTHS[i]} ${y}: Rs. ${f0(v)}`}
                      className="h-8 rounded-md flex items-center justify-center text-[9px] font-bold tabular-nums transition-transform hover:scale-105"
                      style={{ background: heatColor(v), color: v && Math.abs(v) / (summary.maxAbsMonth || 1) > 0.55 ? '#fff' : undefined }}>
                      {v ? fK(v) : ''}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl overflow-hidden flex flex-col shadow-sm">
        <div className="md:hidden p-3 space-y-2.5">
          {paginatedTrades.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400 dark:text-slate-500 font-medium text-sm">{hasActiveFilters ? 'No events match your filters.' : 'No realized gains yet.'}</div>
          ) : (
            paginatedTrades.map((trade) => {
              const isProfit = trade.profit >= 0;
              const totalCost = (trade.buyAvg || 0) * trade.quantity;
              const plPct = totalCost > 0 ? (trade.profit / totalCost) * 100 : null;
              return (
                <div key={`${trade.id}-m`} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/25 p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => filterByTicker(trade.ticker === 'PREV-PNL' ? 'HISTORY' : trade.ticker)} className="font-display font-black text-slate-900 dark:text-white text-sm">{formatAssetLabel(trade.ticker, displayNames)}</button>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${eventBadgeClass(trade)}`}>{eventLabel(trade)}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">{trade.date}{trade.holdDays != null ? ` · ${trade.holdDays}d held` : ''}</div>
                    </div>
                    <div className={`text-right font-mono font-bold tabular-nums text-sm ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                      {isProfit ? '+' : ''}{f0(trade.profit)}
                      {plPct != null && <div className="text-[10px]">{plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%</div>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div><div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Qty</div><div className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">{trade.quantity.toLocaleString()}</div></div>
                    <div><div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Cost NAV</div><div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">{f2(trade.buyAvg || 0)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Sell NAV</div><div className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">{f2(trade.sellPrice || 0)}</div></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="hidden md:block overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm min-w-[980px] whitespace-nowrap">
            <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-left sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <Th label="Date" sortKey="date" />
                <Th label="Fund" sortKey="ticker" />
                <Th label="Type" sortKey="eventType" />
                <Th label="Qty" sortKey="quantity" align="right" />
                <Th label="Cost NAV" sortKey="buyAvg" align="right" />
                <Th label="Sell NAV" sortKey="sellPrice" align="right" />
                <Th label="Proceeds" sortKey="totalSell" align="right" />
                <Th label="Tax" sortKey="tax" align="right" className="opacity-80" />
                <Th label="Hold" sortKey="holdDays" align="right" />
                <Th label="P&L %" align="right" />
                <Th label="Net P&L" sortKey="profit" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedTrades.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">{hasActiveFilters ? 'No events match your filters.' : 'No realized gains yet.'}</td></tr>
              ) : (
                paginatedTrades.map((trade) => {
                  const isProfit = trade.profit >= 0; const totalCost = (trade.buyAvg || 0) * trade.quantity; const totalSell = (trade.sellPrice || 0) * trade.quantity;
                  const plPct = totalCost > 0 ? (trade.profit / totalCost) * 100 : null;
                  return (
                    <tr key={trade.id} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-mono tabular-nums">{trade.date}</td>
                      <td className="px-4 py-3"><button onClick={() => filterByTicker(trade.ticker === 'PREV-PNL' ? 'HISTORY' : trade.ticker)} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-display font-black text-slate-800 dark:text-white text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">{formatAssetLabel(trade.ticker, displayNames)}</button></td>
                      <td className="px-4 py-3"><span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${eventBadgeClass(trade)}`}>{eventLabel(trade)}</span></td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{trade.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{f2(trade.buyAvg || 0)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{f2(trade.sellPrice || 0)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{f2(totalSell)}</td>
                      <td className="px-2 py-3 text-right text-rose-500 dark:text-rose-400 font-mono text-[10px] tabular-nums">{f2(trade.tax || 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums text-xs">{trade.holdDays != null ? `${trade.holdDays}d` : '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold text-xs tabular-nums ${plPct == null ? 'text-slate-400' : plPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{plPct == null ? '-' : `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%`}</td>
                      <td className="px-4 py-3 text-right"><div className={`px-2 py-1 rounded-md inline-block font-mono font-bold tabular-nums text-sm ${isProfit ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400'}`}>{isProfit ? '+' : ''}{f2(trade.profit)}</div></td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredAndSortedTrades.length > 0 && (
              <tfoot className="bg-slate-50/90 dark:bg-slate-800/90 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-900 dark:text-slate-100">
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Totals</td>
                  <td className="px-4 py-4 text-right font-mono tabular-nums text-sm">{totals.qty.toLocaleString()}</td>
                  <td colSpan={2} className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right font-mono tabular-nums text-sm">{f0(totals.sell)}</td>
                  <td className="px-2 py-4 text-right font-mono text-rose-500 dark:text-rose-400 tabular-nums">{f0(totals.tax)}</td>
                  <td className="px-4 py-4"></td>
                  <td className={`px-4 py-4 text-right font-mono text-xs tabular-nums ${totals.cost > 0 && totals.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{totals.cost > 0 ? `${totals.profit >= 0 ? '+' : ''}${((totals.profit / totals.cost) * 100).toFixed(2)}%` : '-'}</td>
                  <td className={`px-4 py-4 text-right font-mono text-base tabular-nums ${totals.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{totals.profit >= 0 ? '+' : ''}{f0(totals.profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Rows per page:</span>
            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-lg text-xs py-1.5 px-2 outline-none text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-5">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">{filteredAndSortedTrades.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAndSortedTrades.length)} of {filteredAndSortedTrades.length}</span>
            <div className="flex gap-1.5">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300"><ChevronLeft size={16} /></button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
