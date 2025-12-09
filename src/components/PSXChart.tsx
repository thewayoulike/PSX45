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
        setData(history);
      } else {
        setError(true); // No data found
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every minute
    const interval = setInterval(loadData, 60 * 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Loading State
  if (loading && data.length === 0) {
    return (
      <div className="w-full bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center" style={{ height }}>
        <Loader2 className="animate-spin text-emerald-500 mb-2" size={32} />
        <span className="text-slate-400 text-sm font-medium">Loading Market Data...</span>
      </div>
    );
  }

  // Error State
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

  // Determine Min/Max for Y-Axis scaling
  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const padding = (maxPrice - minPrice) * 0.1; // Add 10% breathing room

  // Calculate Price Change for Color (Green/Red)
  const startPrice = data[0]?.price || 0;
  const endPrice = data[data.length - 1]?.price || 0;
  const isUp = endPrice >= startPrice;
  const color = isUp ? "#10b981" : "#f43f5e"; // Emerald-500 or Rose-500
  const fillColor = isUp ? "#d1fae5" : "#ffe4e6"; // Emerald-100 or Rose-100

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
            tickFormatter={(unix) => new Date(unix).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            hide={true} // Hide X axis labels for cleaner look (optional)
          />
          <YAxis 
            domain={[minPrice - padding, maxPrice + padding]} 
            orientation="right"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(val) => val.toFixed(2)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
            formatter={(value: number) => [`Rs. ${value.toFixed(2)}`, 'Price']}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PSXChart;
