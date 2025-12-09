import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchStockHistory } from '../services/psxData';
import { Loader2, RefreshCw } from 'lucide-react';

interface PSXChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number;
}

const PSXChart: React.FC<PSXChartProps> = ({ symbol, height = 400 }) => {
  const [data, setData] = useState<{ time: number; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const history = await fetchStockHistory(symbol);
      if (history.length > 0) {
        // Double ensure sorting: Ascending (Oldest -> Newest)
        // This puts latest time on the RIGHT side.
        const sortedHistory = history.sort((a, b) => a.time - b.time);
        setData(sortedHistory);
      } else {
        setError(true); 
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60 * 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading && data.length === 0) {
    return (
      <div className="w-full bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center" style={{ height }}>
        <Loader2 className="animate-spin text-emerald-500 mb-2" size={32} />
        <span className="text-slate-400 text-sm font-medium">Loading Market Data...</span>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="w-full bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center" style={{ height }}>
        <p className="text-slate-400 font-medium mb-4">Chart Data Unavailable</p>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors shadow-sm">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  let minPrice = Math.min(...data.map(d => d.price));
  let maxPrice = Math.max(...data.map(d => d.price));
  
  if (minPrice === maxPrice) {
      minPrice = minPrice * 0.99;
      maxPrice = maxPrice * 1.01;
  }
  
  const padding = (maxPrice - minPrice) * 0.1; 
  const startPrice = data[0]?.price || 0;
  const endPrice = data[data.length - 1]?.price || 0;
  const isUp = endPrice >= startPrice;
  const color = isUp ? "#10b981" : "#f43f5e"; 

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="time" 
            // Show Time on Axis
            tickFormatter={(unix) => new Date(unix).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            hide={false} 
            minTickGap={40}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            domain={[minPrice - padding, maxPrice + padding]} 
            orientation="right"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(val) => val.toFixed(2)}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
            // Show Full Date AND Time in Tooltip
            labelFormatter={(label) => new Date(label).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            formatter={(value: number) => [`Rs. ${value.toFixed(2)}`, 'Price']}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PSXChart;
