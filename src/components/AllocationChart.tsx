import React, { useState, useMemo, useEffect } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
}

// Vibrant palette matching the reference style
const COLORS = [
  '#0088FE', // Blue
  '#00C49F', // Teal
  '#FFBB28', // Yellow/Orange
  '#FF8042', // Orange
  '#F43F5E', // Red/Pink
  '#8884d8', // Purple
  '#82ca9d', // Light Green
  '#a4de6c', // Lime
  '#d0ed57', // Yellow-Green
  '#ffc658', // Light Orange
  '#8dd1e1', // Light Blue
  '#26C6DA', // Cyan
];

const RADIAN = Math.PI / 180;

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('sector');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: displayData, totalValue } = useMemo(() => {
    let rawData: { name: string; value: number; quantity: number }[] = [];

    if (chartMode === 'asset') {
        const assetMap = new Map<string, { value: number; quantity: number }>();
        holdings.forEach(h => {
            const val = h.currentPrice * h.quantity;
            const existing = assetMap.get(h.ticker) || { value: 0, quantity: 0 };
            assetMap.set(h.ticker, { 
                value: existing.value + val, 
                quantity: existing.quantity + h.quantity 
            });
        });
        rawData = Array.from(assetMap.entries())
            .map(([name, data]) => ({ name, value: data.value, quantity: data.quantity }))
            .filter(item => item.value > 0);
    } else {
        const sectorMap = new Map<string, { value: number; quantity: number }>();
        holdings.forEach(h => {
            const val = h.currentPrice * h.quantity;
            if (val > 0) {
                const existing = sectorMap.get(h.sector) || { value: 0, quantity: 0 };
                sectorMap.set(h.sector, { 
                    value: existing.value + val, 
                    quantity: existing.quantity + h.quantity 
                });
            }
        });
        rawData = Array.from(sectorMap.entries())
            .map(([name, data]) => ({ name, value: data.value, quantity: data.quantity }));
    }

    // Sort by Value Descending
    rawData.sort((a, b) => b.value - a.value);
    
    const total = rawData.reduce((acc, item) => acc + item.value, 0);
    
    // Assign colors to data directly so tooltip can access them
    return { 
        data: rawData.map((item, index) => ({
            ...item,
            fill: COLORS[index % COLORS.length]
        })), 
        totalValue: total 
    };
  }, [holdings, chartMode]);

  // Custom Label for the connecting lines
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, fill } = props;
    
    // Mobile optimization: Hide small slices to prevent overlap text
    const threshold = isMobile ? 0.05 : 0.02; 
    if (percent < threshold) return null; 

    const sin = Math.sin(-midAngle * RADIAN);
    const cos = Math.cos(-midAngle * RADIAN);
    
    const sx = cx + (outerRadius + 2) * cos;
    const sy = cy + (outerRadius + 2) * sin;
    
    const mxRadius = isMobile ? outerRadius + 15 : outerRadius + 25;
    const mx = cx + mxRadius * cos;
    const my = cy + mxRadius * sin;
    
    const exLen = isMobile ? 10 : 20;
    const ex = mx + (cos >= 0 ? 1 : -1) * exLen;
    const ey = my;
    
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={1.5} opacity={0.6} />
        <text 
            x={ex + (cos >= 0 ? 5 : -5)} 
            y={ey} 
            dy={4} 
            textAnchor={textAnchor} 
            fill="#64748b" 
            fontSize={isMobile ? 10 : 11} 
            fontWeight="bold"
        >
          {`${(percent * 100).toFixed(1)}%`}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload; 
      const percent = (data.value / totalValue) * 100;
      
      return (
        <div 
            className="relative z-50 text-white text-xs rounded-xl shadow-2xl border border-white/20 p-3 min-w-[160px] backdrop-blur-md"
            style={{ backgroundColor: data.fill, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}
        >
          <div className="font-bold text-sm mb-1 pb-1 border-b border-white/20">{data.name}</div>
          
          <div className="flex justify-between items-center gap-4 mt-1.5">
              <span className="opacity-80">Share:</span>
              <span className="font-mono font-bold">{percent.toFixed(2)}%</span>
          </div>
          
          <div className="flex flex-col gap-1 mt-1.5">
              <div className="flex justify-between items-center gap-4">
                  <span className="opacity-80">Value:</span>
                  <span className="font-mono font-bold">Rs. {Math.round(data.value).toLocaleString()}</span>
              </div>
              
              <div className="text-right opacity-70 text-[10px] font-mono">
                  ({data.quantity.toLocaleString()})
              </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-3xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex flex-col w-full h-full min-h-[550px]">
      
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
          
          {/* Left: Chart Container */}
          <div className="w-full lg:w-3/5 h-[350px] md:h-[400px] relative">
            
            {/* 1. Center Donut Text (Layer 0 - Background) */}
            {/* MOVED BEFORE CHART to ensure z-index correctness: Chart will render ON TOP of this text */}
            {displayData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                   <div className="flex flex-col items-center justify-center">
                       <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-1">TOTAL {chartMode === 'sector' ? 'SECTORS' : 'ASSETS'}</span>
                       <span className="text-slate-800 dark:text-slate-100 font-black text-3xl md:text-4xl tracking-tighter">{displayData.length}</span>
                   </div>
               </div>
            )}

            {/* 2. Chart (Layer 1 - Foreground) */}
            <div className="relative z-10 w-full h-full">
                {displayData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {/* Professional 3D Bevel & Shadow Filter */}
                        <filter id="realistic-3d" x="-20%" y="-20%" width="140%" height="140%">
                          {/* 1. Drop Shadow for Depth */}
                          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
                          <feOffset in="blur" dx="3" dy="5" result="offsetBlur" />
                          <feFlood floodColor="#000000" floodOpacity="0.2" result="offsetColor"/>
                          <feComposite in="offsetColor" in2="offsetBlur" operator="in" result="offsetBlur"/>
                          
                          {/* 2. Soft Bevel Light (Top Left) */}
                          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur2"/>
                          <feSpecularLighting in="blur2" surfaceScale="3" specularConstant="0.6" specularExponent="15" lightingColor="#ffffff" result="specOut">
                            <fePointLight x="-5000" y="-10000" z="20000"/>
                          </feSpecularLighting>
                          <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                          
                          {/* 3. Merge All */}
                          <feMerge>
                            <feMergeNode in="offsetBlur"/> {/* Shadow Bottom */}
                            <feMergeNode in="SourceGraphic"/> {/* Color Middle */}
                            <feMergeNode in="specOut"/> {/* Shine Top */}
                          </feMerge>
                        </filter>
                      </defs>

                      <Pie
                        data={displayData}
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 65 : 95}  
                        outerRadius={isMobile ? 90 : 135} 
                        paddingAngle={2}
                        dataKey="value"
                        label={renderCustomizedLabel}
                        labelLine={false} 
                        filter="url(#realistic-3d)" // Apply the new filter
                        stroke="none"
                      >
                        {displayData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.fill}
                            className="outline-none transition-all duration-300 hover:opacity-90"
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
            </div>
          </div>
          
          {/* Right: Legend List */}
          <div className="w-full lg:w-2/5 flex flex-col h-[400px] overflow-y-auto custom-scrollbar pr-2 relative z-10">
              <div className="space-y-3 pt-2">
                  {displayData.map((item, idx) => {
                      const percent = (item.value / totalValue) * 100;
                      return (
                        <div key={item.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            <div 
                                className="w-3 h-3 rounded-sm shadow-sm shrink-0 transition-transform group-hover:scale-125" 
                                style={{ backgroundColor: item.fill }}
                            ></div>
                            
                            <div className="flex-1 flex justify-between items-center min-w-0">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate pr-2" title={item.name}>
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:block">
                                        Rs. {(item.value / 1000).toFixed(0)}k
                                    </span>
                                    <div className="w-16 flex justify-end">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 min-w-[45px] text-center shadow-sm">
                                            {percent.toFixed(2)}%
                                        </span>
                                    </div>
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
