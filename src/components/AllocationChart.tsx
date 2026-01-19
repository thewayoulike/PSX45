import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
}

// Adjusted Palette to match the reference image specifically
const COLORS = [
  '#0088FE', // Blue (Largest)
  '#82ca9d', // Light Green
  '#FFBB28', // Orange (Engineering)
  '#F43F5E', // Red/Pink (Refinery)
  '#8884d8', // Purple
  '#00C49F', // Cyan
  '#00E676', // Bright Green
  '#D32F2F', // Dark Red
  '#536DFE', // Indigo
  '#E040FB', // Magenta
  '#FF6F00', // Deep Orange
  '#26C6DA', // Teal
];

const RADIAN = Math.PI / 180;

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('sector');

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

  // Render Label Line & Text
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, name } = props;
    if (percent < 0.03) return null; // Hide labels for very small slices

    const sin = Math.sin(-midAngle * RADIAN);
    const cos = Math.cos(-midAngle * RADIAN);
    const sx = cx + (outerRadius + 5) * cos;
    const sy = cy + (outerRadius + 5) * sin;
    const mx = cx + (outerRadius + 25) * cos;
    const my = cy + (outerRadius + 25) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 30; // Longer line
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="#94a3b8" fill="none" strokeWidth={1} />
        <text x={ex + (cos >= 0 ? 5 : -5)} y={ey} dy={4} textAnchor={textAnchor} fill="#475569" fontSize={11} fontWeight="bold">
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
          {data.name}: {percent.toFixed(2)} %
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none flex flex-col w-full h-full min-h-[550px]">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Layers size={24} className="text-emerald-500" />
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

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row items-center gap-8 flex-1">
          
          {/* Chart Section */}
          <div className="w-full lg:w-3/5 h-[400px] relative">
            {displayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {/* Enhanced 3D Shadow Filter */}
                    <filter id="pie-shadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
                      <feOffset in="blur" dx="2" dy="4" result="offsetBlur"/>
                      <feFlood floodColor="#000000" floodOpacity="0.2" result="offsetColor"/>
                      <feComposite in="offsetColor" in2="offsetBlur" operator="in" result="offsetBlur"/>
                      <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  <Pie
                    data={displayData}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}  
                    outerRadius={135} 
                    paddingAngle={3}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={false}
                    filter="url(#pie-shadow)" // Apply 3D effect
                    stroke="none"
                  >
                    {displayData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        className="transition-all duration-300 hover:opacity-90"
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
            
            {/* Donut Center Info */}
            {displayData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                   <div className="flex flex-col items-center justify-center">
                       <span className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-1">TOTAL {chartMode === 'sector' ? 'SECTORS' : 'ASSETS'}</span>
                       <span className="text-slate-800 dark:text-slate-100 font-black text-4xl tracking-tighter">{displayData.length}</span>
                   </div>
               </div>
            )}
          </div>
          
          {/* List Section - Fixed Scrolling Issue */}
          <div className="w-full lg:w-2/5 flex flex-col h-[400px] overflow-y-auto custom-scrollbar pr-2">
              <div className="space-y-3 pt-2">
                  {displayData.map((item, idx) => {
                      const percent = (item.value / totalValue) * 100;
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div key={item.name} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors group">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div 
                                    className="w-3.5 h-3.5 rounded shadow-sm shrink-0" 
                                    style={{ backgroundColor: color }}
                                ></div>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate" title={item.name}>
                                    {item.name}
                                </span>
                            </div>
                            
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium hidden sm:block">
                                    Rs. {(item.value / 1000).toFixed(0)}k
                                </span>
                                <div className="w-16 flex justify-end">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 min-w-[50px] text-center shadow-sm">
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
