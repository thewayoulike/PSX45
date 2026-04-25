import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Transaction } from '../types';
import { fetchStockHistory } from '../services/psxData';
import { Loader2, TrendingUp, RefreshCw, Save } from 'lucide-react';
import { Card } from './ui/Card';

interface PerformanceChartProps {
  transactions: Transaction[];
  savedData: any[]; // The data loaded from Drive
  onSaveData: (data: any[]) => void; // Callback to trigger Drive save
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ transactions, savedData, onSaveData }) => {
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>(savedData || []);

  // Helper: Find which stocks were owned on a specific date
  const getHeldTickersOnDate = (dateStr: string) => {
    const holdings: Record<string, number> = {};
    const txsToDate = transactions.filter(t => t.date <= dateStr);
    
    txsToDate.forEach(t => {
      if (t.type === 'BUY' || t.type === 'TRANSFER_IN') {
        holdings[t.ticker] = (holdings[t.ticker] || 0) + t.quantity;
      } else if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') {
        holdings[t.ticker] = (holdings[t.ticker] || 0) - t.quantity;
      }
    });

    // Return only tickers where quantity > 0
    return Object.keys(holdings).filter(ticker => holdings[ticker] > 0);
  };

  const handleFetchAndCalculate = async () => {
    setLoading(true);
    try {
      // 1. Get all unique stocks ever bought
      const allTickers = Array.from(new Set(
          transactions.filter(t => t.type === 'BUY').map(t => t.ticker)
      ));
      
      const tickersToFetch = ['KSE100', ...allTickers];
      const historyData: Record<string, { time: number, price: number, dateStr: string }[]> = {};

      // 2. Fetch 1M (30 days) data for KSE100 and all owned stocks
      await Promise.all(tickersToFetch.map(async (ticker) => {
        try {
          const data = await fetchStockHistory(ticker, '1M');
          historyData[ticker] = data.map(d => ({
            ...d,
            dateStr: new Date(d.time).toISOString().split('T')[0]
          }));
        } catch (e) {
          console.warn(`Failed to fetch 1M history for ${ticker}`);
          historyData[ticker] = [];
        }
      }));

      const kseData = historyData['KSE100'] || [];
      if (kseData.length < 2) throw new Error("Not enough KSE100 data");

      const newChartData = [];

      // 3. Calculate Daily Returns (Starting from day 1, since day 0 has no previous close)
      for (let i = 1; i < kseData.length; i++) {
        const todayKse = kseData[i];
        const prevKse = kseData[i - 1];
        const dateStr = todayKse.dateStr;
        const displayDate = new Date(todayKse.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        // KSE-100 % Change
        const kseChange = ((todayKse.price - prevKse.price) / prevKse.price) * 100;

        // Portfolio % Change
        const heldTickers = getHeldTickersOnDate(dateStr);
        let portfolioDailySum = 0;
        let validStockCount = 0;

        heldTickers.forEach(ticker => {
            const stockHist = historyData[ticker];
            if (stockHist) {
                const todayIdx = stockHist.findIndex(d => d.dateStr === dateStr);
                // Find the previous trading day for this specific stock
                if (todayIdx > 0) {
                    const todayPrice = stockHist[todayIdx].price;
                    const prevPrice = stockHist[todayIdx - 1].price;
                    const change = ((todayPrice - prevPrice) / prevPrice) * 100;
                    portfolioDailySum += change;
                    validStockCount++;
                }
            }
        });

        const portfolioChange = validStockCount > 0 ? (portfolioDailySum / validStockCount) : 0;

        newChartData.push({
            date: displayDate,
            rawDate: dateStr,
            KSE100: parseFloat(kseChange.toFixed(2)),
            Portfolio: parseFloat(portfolioChange.toFixed(2)),
            heldCount: validStockCount
        });
      }

      setChartData(newChartData);
      onSaveData(newChartData); // Send to App.tsx to save to Drive

    } catch (error) {
      console.error(error);
      alert("Failed to calculate performance history.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full h-[450px] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 uppercase tracking-wider">
          <TrendingUp className="text-emerald-500" size={18} />
          30-Day Daily Return % (Portfolio Avg vs KSE-100)
        </h2>
        <button 
          onClick={handleFetchAndCalculate} 
          disabled={loading}
          className="flex items-center gap-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {chartData.length > 0 ? 'Refresh & Save' : 'Generate & Save'}
        </button>
      </div>

      <div className="flex-1 w-full min-h-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
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
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string) => [`${value}%`, name === 'Portfolio' ? 'Portfolio Avg' : 'KSE-100']}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
              <Line 
                type="monotone" 
                name="Portfolio" 
                dataKey="Portfolio" 
                stroke="#10b981" 
                strokeWidth={2.5} 
                dot={false}
                activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
              />
              <Line 
                type="monotone" 
                name="KSE100" 
                dataKey="KSE100" 
                stroke="#6366f1" 
                strokeWidth={2.5} 
                dot={false} 
                activeDot={{ r: 6, fill: "#6366f1", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
             <Save size={32} className="mb-2 opacity-50" />
             <p className="text-sm font-medium">Click Generate to calculate your 30-day historical returns</p>
          </div>
        )}
      </div>
    </Card>
  );
};
