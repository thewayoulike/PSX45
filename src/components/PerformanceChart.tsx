import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine
} from 'recharts';
import { Transaction } from '../types';
import { fetchStockHistory } from '../services/psxData';
import { formatDatePK } from '../utils/dates';
import { buildPerformanceHistory, PERFORMANCE_METHOD, stockTransactions, performanceSourceKey, type PerformanceRow, type LiveDay, type HistoryPoint } from '../utils/stockPerformance';
import { Loader2, TrendingUp, RefreshCw, Save, AlertCircle, Clock } from 'lucide-react';
import { Card } from './ui/Card';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface PerformanceChartProps {
  transactions: Transaction[];
  savedData: PerformanceRow[];
  onSaveData: (data: PerformanceRow[]) => void;
  liveDay?: LiveDay;
  onRefreshPrices?: () => void | Promise<void>;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ transactions, savedData, onSaveData, liveDay, onRefreshPrices }) => {
  const compact = useMediaQuery('(max-width: 639px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showKSE100, setShowKSE100] = useState(true);
  const [showKMI30, setShowKMI30] = useState(true);
  const generation = useRef(0);
  const save = useRef(onSaveData);
  save.current = onSaveData;
  const sourceKey = performanceSourceKey(transactions);
  const chartData = (savedData || []).filter(row => row.method === PERFORMANCE_METHOD && row.sourceKey === sourceKey);
  const lastUpdated = chartData.at(-1)?.fetchedAt;
  const gaps = chartData.filter(row => row.Portfolio == null);
  const formatTime = (value: string) => new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Karachi', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' PKT';

  const handleFetchAndCalculate = async () => {
    const run = ++generation.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const tickers = [...new Set(['KSE100', 'KMI30', ...stockTransactions(transactions).map(t => t.ticker)])];
      const history: Record<string, HistoryPoint[]> = {};
      let next = 0;
      // Limit concurrent requests on mobile and discard work for an old portfolio.
      await Promise.all(Array.from({ length: Math.min(4, tickers.length) }, async () => {
        while (next < tickers.length && generation.current === run) {
          const ticker = tickers[next++];
          try {
            const data = await fetchStockHistory(ticker, '1M');
            history[ticker] = data.length > 1 ? data.map(d => ({ ...d, dateStr: formatDatePK(new Date(d.time)) })) : [];
          } catch { history[ticker] = []; }
        }
      }));
      if (generation.current !== run) return;
      if ((history.KSE100 || []).length < 2) throw new Error('History is temporarily unavailable. Please retry. Today’s P&L still uses your current quotes.');
      save.current(buildPerformanceHistory(transactions, history));
    } catch (error) {
      if (generation.current === run) setErrorMsg(error instanceof Error ? error.message : 'Unable to calculate history.');
    } finally {
      if (generation.current === run) setLoading(false);
    }
  };

  useEffect(() => {
    if (stockTransactions(transactions).length) void handleFetchAndCalculate();
    return () => { generation.current++; };
    // Rebuild on edits as well as additions; saved results do not trigger another fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const refresh = async () => {
    await Promise.allSettled([handleFetchAndCalculate(), Promise.resolve().then(() => onRefreshPrices?.())]);
  };

  return (
    <Card className="w-full flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-5">

        <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm shrink-0">
                <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
            </div>
            <div>
                <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                    30-Day Daily Stock P&L %
                </h2>
                {lastUpdated && (
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        <Clock size={12} className="opacity-70" /> History retrieved: {formatTime(lastUpdated)}
                    </p>
                )}
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 bg-slate-50/80 dark:bg-slate-800/50 px-4 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={showKSE100}
                onChange={() => setShowKSE100(!showKSE100)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 cursor-pointer transition-colors"
              />
              <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">KSE-100</span>
            </label>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={showKMI30}
                onChange={() => setShowKMI30(!showKMI30)}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer transition-colors"
              />
              <span className="group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">KMI-30</span>
            </label>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? "Fetching Data..." : (chartData.length > 0 ? 'Refresh Data' : 'Generate Chart')}
          </button>
        </div>
      </div>
      
      {liveDay && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm">
          <span className="font-bold text-slate-800 dark:text-slate-100">Today’s P&L <span className="tabular-nums" data-testid="chart-today-return">{liveDay.percent == null ? 'Unavailable' : `${liveDay.percent >= 0 ? '+' : ''}${liveDay.percent.toFixed(2)}%`}</span></span>
          <span className="text-xs text-slate-500">Session {liveDay.date} · Same calculation as the P&amp;L card{liveDay.quoteTime ? ` · Quotes refreshed ${formatTime(liveDay.quoteTime)}` : ''}</span>
        </div>
      )}
      {gaps.length > 0 && <p className="mb-4 text-xs text-slate-500">Gaps mean a price is missing, corporate-action prices need verification, or there was no stock exposure. Missing returns are excluded from comparisons.</p>}

      {errorMsg && (
        <div className="mb-6 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 p-4 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm animate-in fade-in">
            <AlertCircle size={18} />
            {errorMsg}
        </div>
      )}
      
      <div className="w-full min-w-0 relative" style={{ height: compact ? 280 : 400 }} role="img" aria-label="Daily stock P&L and benchmark returns over time. Tap a point for exact values.">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} className="text-slate-400 dark:text-slate-500" />
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
              <XAxis dataKey="date" minTickGap={compact ? 36 : 20} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={54} />

              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                formatter={(value: number, name: string) => [
                  <span className="font-mono">{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>,
                  name === 'Daily stock P&L' || name === 'Portfolio' ? 'Your daily P&L' : name === 'KSE100' ? 'KSE-100' : 'KMI-30'
                ]}
                labelStyle={{ fontWeight: '900', color: '#0f172a', marginBottom: '6px', fontSize: '13px' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '15px' }} />

              <Line isAnimationActive={!compact && !reduceMotion} type="linear" connectNulls={false} name="Daily stock P&L" dataKey="Portfolio" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }} />

              {showKSE100 && (
                <Line isAnimationActive={!compact && !reduceMotion} type="linear" connectNulls={false} name="KSE100" dataKey="KSE100" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: "#6366f1", strokeWidth: 0 }} />
              )}

              {showKMI30 && (
                <Line isAnimationActive={!compact && !reduceMotion} type="linear" connectNulls={false} name="KMI30" dataKey="KMI30" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: "#f59e0b", strokeWidth: 0 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 transition-all">
             <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5 shadow-inner">
                 <Save size={28} className="text-slate-400 dark:text-slate-500" />
             </div>
             <p className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ready to Calculate</p>
             <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm">Generate your daily stock P&L history alongside KSE-100 and KMI-30.</p>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">Stock P&L includes today’s buys and sells, before fees and dividends. % uses opening stock value plus purchases and transfers in; cash is excluded. History uses daily closing prices; today uses the same quotes as your P&L card.</p>
    </Card>
  );
};
