import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
}

// Vibrant palette matching the reference style
const COLORS = [
  '#0284c7', // Blue
  '#84cc16', // Lime Green
  '#f59e0b', // Amber/Orange
  '#f43f5e', // Pink/Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#e11d48', // Rose
  '#6366f1', // Indigo
  '#d946ef', // Fuchsia
  '#f97316', // Orange
  '#14b8a6', // Teal
];

const RADIAN = Math.PI / 180;

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('sector'); // Default to sector to match image

  const { data: displayData, totalValue } = useMemo(() => {
    let rawData: { name: string; value: number }[] = [];

    if (chartMode === 'asset') {
        const assetMap = new Map<string, number>();
        holdings.forEach(h => {
            const val = h.currentPrice * h.quantity;
            assetMap.set(h.ticker, (assetMap.get(h.ticker) || 0) + val);
        });
        rawData = Array.from(assetMap.entries())
            .map(([name, value]) => ({ name, value }))
            .filter(item => item.value > 0);
    } else {
        const sectorMap = new Map<string, number>();
        holdings.forEach(h => {
            const val = h.currentPrice * h.quantity;
            if (val > 0) {
                sectorMap.set(h.sector, (sectorMap.get(h.sector) || 0) + val);
            }
        });
        rawData = Array.from(sectorMap.entries())
            .map(([name, value]) => ({ name, value }));
    }

    // Sort by Value Descending
    rawData.sort((a, b) => b.value - a.value);
    
    const total = rawData.reduce((acc, item) => acc + item.value, 0);
    return { data: rawData, totalValue: total };
  }, [holdings, chartMode]);

  // Custom Label for the connecting lines
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, value } = props;
    // Only show label if slice is significant enough to avoid clutter
    if (percent < 0.01) return null; 

    const sin = Math.sin(-midAngle * RADIAN);
    const cos = Math.cos(-midAngle * RADIAN);
    const sx = cx + (outerRadius + 5) * cos;
    const sy = cy + (outerRadius + 5) * sin;
    const mx = cx + (outerRadius + 20) * cos;
    const my = cy + (outerRadius + 20) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 15;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="#94a3b8" fill="none" strokeWidth={1} />
        <text x={ex + (cos >= 0 ? 5 : -5)} y={ey} dy={4} textAnchor={textAnchor} fill="#475569" fontSize={10} fontWeight="bold">
          {`${(percent * 100).toFixed(2)} %`}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = (data.value / totalValue) * 100;
      return (
        <div className="bg-[#84cc16] text-white text-xs font-bold px-3 py-2 rounded shadow-lg border border-[#65a30d]">
          {data.name}: {percent.toFixed(2)} % ({Math.round(data.value).toLocaleString()})
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-3xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex flex-col w-full h-full min-h-[500px]">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Layers size={20} className="text-emerald-500" />
            Allocation Analysis
          </h2>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setChartMode('sector')} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartMode === 'sector' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                  <Layers size={14} /> Sector
              </button>
              <button 
                onClick={() => setChartMode('asset')} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartMode === 'asset' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                  <PieChartIcon size={14} /> Asset
              </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row items-center gap-8 flex-1">
          
          {/* Left: Chart */}
          <div className="w-full lg:w-3/5 h-[400px] relative">
            {displayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* 3D-like Filter Definitions */}
                  <defs>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
                      <feOffset in="blur" dx="3" dy="5" result="offsetBlur" />
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.3" /> 
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode in="offsetBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    
                    {/* Inner Gloss Gradient */}
                    <radialGradient id="gloss" cx="50%" cy="50%" r="50%" fx="40%" fy="40%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3"/>
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                    </radialGradient>
                  </defs>

                  <Pie
                    data={displayData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}  
                    outerRadius={130} 
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={false} // We draw custom path in renderCustomizedLabel
                    filter="url(#shadow)"
                    stroke="none"
                  >
                    {displayData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-400">
                <PieChartIcon size={48} className="mb-2 opacity-20" />
                <span className="text-sm font-bold opacity-50">No Data Available</span>
              </div>
            )}
            
            {/* Center Donut Text */}
            {displayData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                   <div className="w-32 h-32 rounded-full border-4 border-slate-50 dark:border-slate-800 shadow-inner flex flex-col items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                       <span className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Total {chartMode}s</span>
                       <span className="text-slate-800 dark:text-slate-100 font-black text-2xl tracking-tighter">{displayData.length}</span>
                   </div>
               </div>
            )}
          </div>
          
          {/* Right: Legend List */}
          <div className="w-full lg:w-2/5 flex flex-col justify-center h-[400px] overflow-y-auto custom-scrollbar pr-2">
              <div className="space-y-1">
                  {displayData.map((item, idx) => {
                      const percent = (item.value / totalValue) * 100;
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div key={item.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            <div 
                                className="w-3 h-3 rounded-sm shadow-sm shrink-0 transition-transform group-hover:scale-125" 
                                style={{ backgroundColor: color }}
                            ></div>
                            
                            <div className="flex-1 flex justify-between items-center min-w-0">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate pr-2" title={item.name}>
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:block">
                                        Rs. {(item.value / 1000).toFixed(0)}k
                                    </span>
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 min-w-[50px] text-right">
                                        {percent.toFixed(2)} %
                                    </span>
                                </div>
                            </div>
                        </div>
                      );
                  })}
              </div>
          </div>

      </div>
    </div>
  );
};
