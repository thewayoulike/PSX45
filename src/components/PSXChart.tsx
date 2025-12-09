import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchStockHistory, TimeRange } from '../services/psxData';
import { Loader2, RefreshCw } from 'lucide-react';

interface PSXChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number;
}

const RANGES: TimeRange[] = ['1D', '1M', '6M', 'YTD', '1Y', '3Y', '5Y'];

const PSXChart: React.FC<PSXChartProps> = ({ symbol, height = 400 }) => {
  const [data, setData] = useState<{ time: number; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<TimeRange>('1D');

  const loadData = async (selectedRange: TimeRange) => {
    setLoading(true);
    setError(false);
    try {
      const history = await fetchStockHistory(symbol, selectedRange);
      if (history.length > 0) {
        setData(history);
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
    loadData(range);
    // Only auto-refresh 1D data
    if (range === '1D') {
        const interval = setInterval(() => loadData('1D'), 60 * 1000);
        return () => clearInterval(interval);
    }
  }, [symbol, range]);

  // Chart Helpers
  let minPrice = 0, maxPrice = 0, padding = 0, color = "#10b981";
  
  if (data.length > 0) {
      minPrice = Math.min(...data.map(d => d.price));
      maxPrice = Math.max(...data.map(d => d.price));
      if (minPrice === maxPrice) { minPrice *= 0.99; maxPrice *= 1.01; }
      padding = (maxPrice - minPrice) * 0.1;
      
      const startPrice = data[0].price;
      const endPrice = data[data.length - 1].price;
      color = endPrice >= startPrice ? "#10b981" : "#f43f5e";
  }

  // X-Axis formatter changes based on range
  const formatXAxis = (unix: number) => {
      const date = new Date(unix);
      if (range === '1D') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (range === '1M' || range === '6M') return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col" style={{ height }}>
      
      {/* 1. Header with Range Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  Live Market Chart
              </span>
          </div>
          
          {/* Replicating the 1D 1M 6M... style */}
          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
              {RANGES.map((r) => (
                  <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                          range === r 
                              ? 'bg-emerald-600 text-white shadow-sm' 
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                      }`}
                  >
                      {r}
                  </button>
              ))}
          </div>
      </div>

      {/* 2. Chart Area */}
      <div className="flex-1 w-full relative min-h-0">
          {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
                  <Loader2 className="animate-spin text-emerald-500 mb-2" size={32} />
                  <span className="text-slate-400 text-xs font-bold">Loading {range} Data...</span>
              </div>
          )}

          {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                  <p className="text-slate-400 font-medium mb-4 text-sm">Data Unavailable</p>
                  <button onClick={() => loadData(range)} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-xs font-bold">
                      <RefreshCw size={14} /> Retry
                  </button>
              </div>
          )}

          {data.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                      <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                              <stop offset="95%" stopColor={color} stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                          dataKey="time" 
                          tickFormatter={formatXAxis}
                          hide={false} 
                          minTickGap={range === '1D' ? 40 : 50}
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
                          width={45}
                      />
                      <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#1e293b', fontWeight: 'bold', fontSize: '12px' }}
                          labelFormatter={(label) => new Date(label).toLocaleString([], { 
                              month: 'short', day: 'numeric', 
                              hour: range === '1D' ? '2-digit' : undefined, 
                              minute: range === '1D' ? '2-digit' : undefined,
                              year: range !== '1D' ? 'numeric' : undefined
                          })}
                          formatter={(value: number) => [`Rs. ${value.toFixed(2)}`, 'Price']}
                      />
                      <Area 
                          type="monotone" 
                          dataKey="price" 
                          stroke={color} 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorPrice)" 
                          animationDuration={500}
                      />
                  </AreaChart>
              </ResponsiveContainer>
          )}
      </div>
    </div>
  );
};

export default PSXChart;
