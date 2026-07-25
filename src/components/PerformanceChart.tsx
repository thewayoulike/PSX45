import React, { useState, useEffect } from 'react';
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
import { KMI30 } from '../services/indices';
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
  
  // NEW STATES: For Last Updated and Line Toggles
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showKSE100, setShowKSE100] = useState<boolean>(true);
  const [showKMI30, setShowKMI30] = useState<boolean>(true);

  // Sync internal state when switching portfolios or loading from Drive
  useEffect(() => {
    setChartData(savedData);
    if (savedData && savedData.length > 0) {
        // If we load saved data initially, we can show a general "Loaded from save" message, 
        // or just leave it blank until they hit refresh. 
        setLastUpdated(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    }
  }, [savedData]);

  // Helper to calculate exact quantities held on a specific historical date
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
      
      const tickersToFetch = Array.from(new Set(['KSE100', ...KMI30, ...userTickers]));
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
      if (kseData.length < 2) {
          throw new Error("Unable to fetch KSE100 data. Please try again in a few moments.");
      }

      const newChartData = [];
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      for (let i = 1; i < kseData.length; i++) {
        const todayKse = kseData[i];
        
        if (todayKse.time < thirtyDaysAgo) continue;

        const prevKse = kseData[i - 1];
        const dateStr = todayKse.dateStr;
        const displayDate = new Date(todayKse.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const kseChange = prevKse.price > 0 ? ((todayKse.price - prevKse.price) / prevKse.price) * 100 : 0;

        let kmiTotalChange = 0;
        let kmiStockCount = 0;

        KMI30.forEach(ticker => {
          const stockHist = historyData[ticker];
          if (stockHist && stockHist.length > 0) {
            const todayIdx = stockHist.findIndex(d => d.dateStr === dateStr);
            if (todayIdx > 0) {
              const todayPrice = stockHist[todayIdx].price;
              const prevPrice = stockHist[todayIdx - 1].price;
              if (prevPrice > 0) {
                kmiTotalChange += ((todayPrice - prevPrice) / prevPrice) * 100;
                kmiStockCount++;
              }
            }
          }
        });
        const kmiChange = kmiStockCount > 0 ? kmiTotalChange / kmiStockCount : 0;

        const heldBalances = getHeldBalancesOnDate(dateStr);
        let yesterdayTotalValue = 0;
        let todayTotalValue = 0;
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
                    validStockCount++;
                }
            }
        });

        let portfolioChange = 0;
        if (yesterdayTotalValue > 0) {
            portfolioChange = ((todayTotalValue - yesterdayTotalValue) / yesterdayTotalValue) * 100;
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
      
      // Update Timestamp on successful fetch
      setLastUpdated(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

    } catch (error: any) {
      console.error("Performance Calculation Error:", error);
      setErrorMsg(error.message || "Failed to calculate performance history.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        
        {/* Title & Last Updated Area */}
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 uppercase tracking-wider">
            <TrendingUp className="text-emerald-500" size={18} />
            30-Day Daily Return %
          </h2>
          {lastUpdated && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1 font-medium">
              <Clock size={12} />
              Last updated: {lastUpdated}
            </p>
          )}
        </div>

        {/* Toggles & Refresh Button Area */}
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Index Toggles */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showKSE100} 
                onChange={() => setShowKSE100(!showKSE100)} 
                className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
              />
              KSE-100
            </label>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showKMI30} 
                onChange={() => setShowKMI30(!showKMI30)} 
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              KMI-30
            </label>
          </div>

          <button 
            onClick={handleFetchAndCalculate} 
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? "Fetching Data..." : (chartData.length > 0 ? 'Refresh Data' : 'Generate Chart')}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 bg-rose-50 text-rose-600 p-3 rounded-lg flex items-center gap-2 text-xs font-bold border border-rose-200">
            <AlertCircle size={16} />
            {errorMsg}
        </div>
      )}

      <div className="w-full" style={{ height: '400px' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
              
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />

              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10, fill: '#94a3b8' }} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tickFormatter={(val) => `${val}%`} 
                tick={{ fontSize: 10, fill: '#94a3b8' }} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                formatter={(value: number, name: string) => [
                  `${value}%`, 
                  name === 'Portfolio' ? 'Portfolio Avg' : name === 'KSE100' ? 'KSE-100' : 'KMI-30'
                ]}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
              
              <Line 
                type="monotone" 
                name="Portfolio" 
                dataKey="Portfolio" 
                stroke="#10b981" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
              />
              
              {/* Conditionally Render KSE-100 */}
              {showKSE100 && (
                <Line 
                  type="monotone" 
                  name="KSE100" 
                  dataKey="KSE100" 
                  stroke="#6366f1" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }} 
                  activeDot={{ r: 6, fill: "#6366f1", strokeWidth: 0 }}
                />
              )}
              
              {/* Conditionally Render KMI-30 */}
              {showKMI30 && (
                <Line 
                  type="monotone" 
                  name="KMI30" 
                  dataKey="KMI30" 
                  stroke="#f59e0b" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} 
                  activeDot={{ r: 6, fill: "#f59e0b", strokeWidth: 0 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
             <Save size={32} className="mb-2 opacity-50" />
             <p className="text-sm font-medium">Click Generate to calculate your 30-day historical returns</p>
          </div>
        )}
      </div>
    </Card>
  );
};
