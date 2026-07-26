import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchStockHistory, TimeRange } from '../services/psxData';
import { Loader2, RefreshCw, Activity } from 'lucide-react';

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
    <div className="w-full bg-white/80 dark:bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex flex-col" style={{ height }}>
      
      {/* 1. Header with Range Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm shrink-0">
                  <Activity size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-display font-black text-slate-900 dark:text-white text-lg tracking-tight">
                  Live Market Chart
              </span>
          </div>
          
          {/* Premium Segmented Control Style */}
          <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-inner overflow-x-auto custom-scrollbar max-w-full">
              {RANGES.map((r) => (
                  <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                          range === r 
                              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
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
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm z-10 rounded-xl">
                  <Loader2 className="animate-spin text-emerald-500 mb-3" size={32} />
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold tracking-widest uppercase">Loading {range} Data...</span>
              </div>
          )}

          {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 rounded-xl">
                  <p className="text-slate-500 dark:text-slate-400 font-bold mb-4 text-sm tracking-wide">Data Unavailable</p>
                  <button onClick={() => loadData(range)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold shadow-sm hover:-translate-y-0.5 active:translate-y-0">
                      <RefreshCw size={14} /> Retry Connection
                  </button>
              </div>
          )}

          {data.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                      <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.25}/>
                              <stop offset="95%" stopColor={color} stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} stroke="currentColor" className="text-slate-400 dark:text-slate-500" />
                      <XAxis 
                          dataKey="time" 
                          tickFormatter={formatXAxis}
                          hide={false} 
                          minTickGap={range === '1D' ? 40 : 50}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                      />
                      <YAxis 
                          domain={[minPrice - padding, maxPrice + padding]} 
                          orientation="right"
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          tickFormatter={(val) => val.toFixed(2)}
                          axisLine={false}
                          tickLine={false}
                          width={45}
                      />
                      <Tooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#0f172a', fontWeight: '900', fontSize: '14px', fontFamily: 'monospace' }}
                          labelStyle={{ color: '#64748b', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}
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
                          strokeWidth={2.5}
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
