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
import { Loader2, TrendingUp, RefreshCw, Save, AlertCircle, Clock } from 'lucide-react';
import { Card } from './ui/Card';

interface PerformanceChartProps {
  transactions: Transaction[];
  savedData: any[];
  onSaveData: (data: any[]) => void;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ transactions, savedData, onSaveData }) => {
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>(savedData || []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States for Last Updated and Line Toggles
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showKSE100, setShowKSE100] = useState<boolean>(true);
  const [showKMI30, setShowKMI30] = useState<boolean>(true);
  
  // Track if the initial auto-sync has run for this session
  const initialCalcDone = useRef(false);

  // Sync internal state when switching portfolios or loading from Drive
  useEffect(() => {
    setChartData(savedData);
    if (savedData && savedData.length > 0) {
        setLastUpdated(new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    }
  }, [savedData]);

  // NEW: Auto-refresh chart data on initial load/login once transactions are available
  useEffect(() => {
    if (transactions.length > 0 && !initialCalcDone.current) {
      initialCalcDone.current = true;
      handleFetchAndCalculate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.length]); 

  const getHeldBalancesOnDate = (dateStr: string) => {
    const holdings: Record<string, number> = {};
    const txsToDate = transactions.filter(t => t.date <= dateStr);

    txsToDate.forEach(t => {
      if (t.type === 'BUY' || t.type === 'TRANSFER_IN') {
        holdings[t.ticker] = (holdings[t.ticker] || 0) + t.quantity;
      } else if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') {
        holdings[t.ticker] = (holdings[t.ticker] || 0) - t.quantity;
      }
    });
    const validHoldings: Record<string, number> = {};
    Object.keys(holdings).forEach(ticker => {
        if (holdings[ticker] > 0.0001) {
            validHoldings[ticker] = holdings[ticker];
        }
    });

    return validHoldings;
  };

  const handleFetchAndCalculate = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const userTickers = Array.from(new Set(
          transactions.filter(t => t.type === 'BUY').map(t => t.ticker)
      ));

      // Fetch both KSE100 and KMI30 official indices, plus portfolio stocks
      const tickersToFetch = Array.from(new Set(['KSE100', 'KMI30', ...userTickers]));
      const historyData: Record<string, { time: number, price: number, dateStr: string }[]> = {};
      await Promise.all(tickersToFetch.map(async (ticker) => {
        try {
          const data = await fetchStockHistory(ticker, '1M');
          if (data && data.length > 1) {
            historyData[ticker] = data.map(d => ({
                ...d,
                dateStr: new Date(d.time).toISOString().split('T')[0]
            }));
          } else {
            historyData[ticker] = [];
          }
        } catch (e) {
          console.warn(`Failed to fetch history for ${ticker}`);
          historyData[ticker] = [];
        }
      }));
      
      const kseData = historyData['KSE100'] || [];
      const kmiData = historyData['KMI30'] || [];
      
      if (kseData.length < 2) {
          throw new Error("Unable to fetch KSE100 data. Please try again in a few moments.");
      }

      // Average buy cost per ticker (for cost-basis daily %, matching the Today's P&L card)
      const costAgg: Record<string, { qty: number; cost: number }> = {};
      transactions.forEach(t => {
        if (t.type === 'BUY' || t.type === 'TRANSFER_IN') {
          const c = (costAgg[t.ticker] ||= { qty: 0, cost: 0 });
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          c.qty += t.quantity;
          c.cost += t.quantity * t.price + fees;
        }
      });
      const avgCostByTicker: Record<string, number> = {};
      Object.entries(costAgg).forEach(([tk, c]) => { avgCostByTicker[tk] = c.qty > 0 ? c.cost / c.qty : 0; });

      const newChartData = [];
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      // Process day-by-day calculations
      for (let i = 1; i < kseData.length; i++) {
        const todayKse = kseData[i];

        if (todayKse.time < thirtyDaysAgo) continue;
        const prevKse = kseData[i - 1];
        const dateStr = todayKse.dateStr;
        const displayDate = new Date(todayKse.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const kseChange = prevKse.price > 0 ? ((todayKse.price - prevKse.price) / prevKse.price) * 100 : 0;
        
        // Calculate KMI-30 change using the official API index values
        let kmiChange = 0;
        if (kmiData.length > 0) {
            const todayKmi = kmiData.find(d => d.dateStr === dateStr);
            const prevKmi = kmiData.find(d => d.dateStr === prevKse.dateStr);

            if (todayKmi && prevKmi && prevKmi.price > 0) {
                kmiChange = ((todayKmi.price - prevKmi.price) / prevKmi.price) * 100;
            }
        }
        
        const heldBalances = getHeldBalancesOnDate(dateStr);
        let yesterdayTotalValue = 0;
        let todayTotalValue = 0;
        let dayCostBasis = 0;
        let validStockCount = 0;
        
        Object.entries(heldBalances).forEach(([ticker, qty]) => {
            const stockHist = historyData[ticker];
            if (stockHist && stockHist.length > 0) {
                const todayIdx = stockHist.findIndex(d => d.dateStr === dateStr);
                if (todayIdx > 0) {
                    const todayPrice = stockHist[todayIdx].price;
                    const prevPrice = stockHist[todayIdx - 1].price;

                    yesterdayTotalValue += (prevPrice * qty);
                    todayTotalValue += (todayPrice * qty);
                    dayCostBasis += (avgCostByTicker[ticker] || 0) * qty;
                    validStockCount++;
                }
            }
        });
        
        let portfolioChange = 0;
        // Daily P&L as % of invested cost — same method as the Today's P&L card.
        if (dayCostBasis > 0) {
            portfolioChange = ((todayTotalValue - yesterdayTotalValue) / dayCostBasis) * 100;
        }
        
        if (!isNaN(kseChange) && !isNaN(portfolioChange)) {
            newChartData.push({
                date: displayDate,
                rawDate: dateStr,
                KSE100: parseFloat(kseChange.toFixed(2)),
                KMI30: parseFloat(kmiChange.toFixed(2)),
                Portfolio: parseFloat(portfolioChange.toFixed(2)),
                heldCount: validStockCount
            });
        }
      }
      
      setChartData(newChartData);
      onSaveData(newChartData);
      setLastUpdated(new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    } catch (error: any) {
      console.error("Performance Calculation Error:", error);
      setErrorMsg(error.message || "Failed to calculate performance history.");
    } finally {
      setLoading(false);
    }
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
                    30-Day Daily Return %
                </h2>
                {lastUpdated && (
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        <Clock size={12} className="opacity-70" /> Last updated: {lastUpdated}
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
            onClick={handleFetchAndCalculate}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? "Fetching Data..." : (chartData.length > 0 ? 'Refresh Data' : 'Generate Chart')}
          </button>
        </div>
      </div>
      
      {errorMsg && (
        <div className="mb-6 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 p-4 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm animate-in fade-in">
            <AlertCircle size={18} />
            {errorMsg}
        </div>
      )}
      
      <div className="w-full relative" style={{ height: '400px' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} className="text-slate-400 dark:text-slate-500" />
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis domain={[-10, 10]} ticks={[10, 0, -10]} allowDataOverflow tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={45} />

              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                formatter={(value: number, name: string) => [
                  <span className="font-mono">{value}%</span>,
                  name === 'Portfolio' ? 'Portfolio Avg' : name === 'KSE100' ? 'KSE-100' : 'KMI-30'
                ]}
                labelStyle={{ fontWeight: '900', color: '#0f172a', marginBottom: '6px', fontSize: '13px' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '15px' }} />

              <Line type="monotone" name="Portfolio" dataKey="Portfolio" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }} />

              {showKSE100 && (
                <Line type="monotone" name="KSE100" dataKey="KSE100" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#6366f1", strokeWidth: 0 }} />
              )}

              {showKMI30 && (
                <Line type="monotone" name="KMI30" dataKey="KMI30" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#f59e0b", strokeWidth: 0 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 transition-all">
             <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5 shadow-inner">
                 <Save size={28} className="text-slate-400 dark:text-slate-500" />
             </div>
             <p className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ready to Calculate</p>
             <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm">Click Generate to calculate your 30-day historical returns benchmarked against KSE-100 and KMI-30.</p>
          </div>
        )}
      </div>
    </Card>
  );
};
