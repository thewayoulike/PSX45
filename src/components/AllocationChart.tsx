import React, { useState, useMemo, useEffect } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';
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
  const [activeIndex, setActiveIndex] = useState<number>(-1); // Track clicked slice

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

    rawData.sort((a, b) => b.value - a.value);
    const total = rawData.reduce((acc, item) => acc + item.value, 0);
    
    return { 
        data: rawData.map((item, index) => ({
            ...item,
            fill: COLORS[index % COLORS.length]
        })), 
        totalValue: total 
    };
  }, [holdings, chartMode]);

  const onPieClick = (_: any, index: number) => {
    setActiveIndex(index === activeIndex ? -1 : index); // Toggle open/close
  };

  // --- RENDER ACTIVE SHAPE (The Split Slice) ---
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    
    // Calculate the "Split" offset based on angle
    const midAngle = (startAngle + endAngle) / 2;
    const splitDistance = 15; // How far it splits from the circle
    const sx = cx + (splitDistance * Math.cos(-midAngle * RADIAN));
    const sy = cy + (splitDistance * Math.sin(-midAngle * RADIAN));

    return (
      <g>
        <Sector
          cx={sx}
          cy={sy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          filter="url(#realistic-3d)" // Ensure 3D effect stays on the moved slice
          stroke="none"
        />
      </g>
    );
  };

  // --- CUSTOM LABELS (Connectors) ---
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, fill, index } = props;
    
    const threshold = isMobile ? 0.05 : 0.02; 
    if (percent < threshold) return null; 

    // Determine center coordinates (Shifted if active, Normal if not)
    const isActive = index === activeIndex;
    const splitDistance = isActive ? 15 : 0;
    
    const cosMid = Math.cos(-midAngle * RADIAN);
    const sinMid = Math.sin(-midAngle * RADIAN);

    const currentCx = cx + (splitDistance * cosMid);
    const currentCy = cy + (splitDistance * sinMid);

    const sx = currentCx + (outerRadius + 2) * cosMid;
    const sy = currentCy + (outerRadius + 2) * sinMid;
    
    const mxRadius = isMobile ? outerRadius + 15 : outerRadius + 25;
    const mx = currentCx + mxRadius * cosMid;
    const my = currentCy + mxRadius * sinMid;
    
    const exLen = isMobile ? 10 : 20;
    const ex = mx + (cosMid >= 0 ? 1 : -1) * exLen;
    const ey = my;
    
    const textAnchor = cosMid >= 0 ? 'start' : 'end';

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={1.5} opacity={0.6} />
        <text 
            x={ex + (cosMid >= 0 ? 5 : -5)} 
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
                onClick={() => { setChartMode('sector'); setActiveIndex(-1); }} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartMode === 'sector' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                  <Layers size={14} /> Sector
              </button>
              <button 
                onClick={() => { setChartMode('asset'); setActiveIndex(-1); }} 
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
            
            {/* Center Donut Text (Layer 0 - Background) */}
            {displayData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                   <div className="flex flex-col items-center justify-center">
                       <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-1">TOTAL {chartMode === 'sector' ? 'SECTORS' : 'ASSETS'}</span>
                       <span className="text-slate-800 dark:text-slate-100 font-black text-3xl md:text-4xl tracking-tighter">{displayData.length}</span>
                   </div>
               </div>
            )}

            {/* Chart (Layer 1 - Foreground) */}
            <div className="relative z-10 w-full h-full">
                {displayData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {/* Realistic 3D Filter */}
                        <filter id="realistic-3d" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
                          <feOffset in="blur" dx="3" dy="5" result="offsetBlur" />
                          <feFlood floodColor="#000000" floodOpacity="0.2" result="offsetColor"/>
                          <feComposite in="offsetColor" in2="offsetBlur" operator="in" result="offsetBlur"/>
                          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur2"/>
                          <feSpecularLighting in="blur2" surfaceScale="3" specularConstant="0.6" specularExponent="15" lightingColor="#ffffff" result="specOut">
                            <fePointLight x="-5000" y="-10000" z="20000"/>
                          </feSpecularLighting>
                          <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                          <feMerge>
                            <feMergeNode in="offsetBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                            <feMergeNode in="specOut"/>
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
                        filter="url(#realistic-3d)"
                        stroke="none"
                        activeIndex={activeIndex}
                        activeShape={renderActiveShape} // Renders the split slice
                        onClick={onPieClick} // Handles the click event
                        cursor="pointer"
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
                        <div 
                            key={item.name} 
                            onClick={() => setActiveIndex(idx === activeIndex ? -1 : idx)}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200 group ${activeIndex === idx ? 'bg-slate-100 dark:bg-slate-800 scale-[1.02] shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            <div 
                                className="w-3 h-3 rounded-sm shadow-sm shrink-0 transition-transform group-hover:scale-125" 
                                style={{ backgroundColor: item.fill }}
                            ></div>
                            
                            <div className="flex-1 flex justify-between items-center min-w-0">
                                <span className={`text-xs font-bold truncate pr-2 ${activeIndex === idx ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`} title={item.name}>
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:block">
                                        Rs. {(item.value / 1000).toFixed(0)}k
                                    </span>
                                    <div className="w-16 flex justify-end">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border min-w-[45px] text-center shadow-sm ${activeIndex === idx ? 'bg-white dark:bg-slate-700 text-emerald-600 border-emerald-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
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
