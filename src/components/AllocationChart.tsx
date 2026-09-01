import React, { useState, useMemo, useEffect } from 'react';
import { Holding, PortfolioType } from '../types';
import { isFundTicker } from '../utils/fundId';
import { formatFundShortLabel } from '../utils/fundDisplay';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
  portfolioType?: PortfolioType;
  displayNames?: Record<string, string>;
}

// Vibrant palette matching the reference style
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#F43F5E', 
  '#8884d8', '#82ca9d', '#a4de6c', '#d0ed57', '#ffc658', 
  '#8dd1e1', '#26C6DA',
];

const RADIAN = Math.PI / 180;

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings, portfolioType = 'PSX', displayNames = {} }) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>(isFund ? 'asset' : 'sector');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

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
            .map(([name, data]) => ({
              name: formatFundShortLabel(name, displayNames, 32),
              value: data.value,
              quantity: data.quantity,
            }))
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
    setActiveIndex(index === activeIndex ? -1 : index);
  };

  // --- RENDER ACTIVE SHAPE (The Split Slice) ---
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    
    // Calculate the "Split" offset based on angle
    const midAngle = (startAngle + endAngle) / 2;
    const splitDistance = 15; 
    const sx = cx + (splitDistance * Math.cos(-midAngle * RADIAN));
    const sy = cy + (splitDistance * Math.sin(-midAngle * RADIAN));

    return (
      <g>
        <Sector
          cx={sx}
          cy={sy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 4} // Slightly enlarge active slice
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          filter="url(#realistic-3d)"
          stroke="none"
          className="transition-all duration-300"
        />
      </g>
    );
  };

  // --- CUSTOM LABELS (Connectors) ---
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, fill, index } = props;
    
    const threshold = isMobile ? 0.05 : 0.02; 
    if (percent < threshold) return null; 

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
      <g className="pointer-events-none">
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={2} opacity={0.5} />
        <text 
            x={ex + (cosMid >= 0 ? 6 : -6)} 
            y={ey} 
            dy={4} 
            textAnchor={textAnchor} 
            fill="currentColor" 
            className="text-[10px] md:text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400"
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
            className="relative z-50 text-white rounded-2xl shadow-card border border-white/10 p-3.5 min-w-[170px] backdrop-blur-xl"
            style={{ backgroundColor: `${data.fill}FA` }}
        >
          <div className="font-display font-black text-sm mb-2 pb-2 border-b border-white/20 tracking-wide">{data.name}</div>
          
          <div className="flex justify-between items-center gap-4 mt-2">
              <span className="opacity-90 text-xs font-medium uppercase tracking-wider">Share</span>
              <span className="tabular-nums font-bold text-sm">{percent.toFixed(2)}%</span>
          </div>
          
          <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-white/10">
              <div className="flex justify-between items-center gap-4">
                  <span className="opacity-90 text-xs font-medium uppercase tracking-wider">Value</span>
                  <span className="tabular-nums font-bold text-sm">Rs. {Math.round(data.value).toLocaleString()}</span>
              </div>
              <div className="text-right opacity-80 text-[10px] tabular-nums font-medium">
                  ({data.quantity.toLocaleString()} qty)
              </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6 flex flex-col w-full h-full min-h-[550px]">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20">
                <Layers size={16} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            Allocation Analysis
          </h2>
          <div className="flex bg-slate-50 dark:bg-slate-800/50 rounded-xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
              <button 
                onClick={() => { setChartMode('sector'); setActiveIndex(-1); }} 
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${chartMode === 'sector' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/50 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                  <Layers size={14} /> {isFund ? 'Category' : 'Sector'}
              </button>
              <button 
                onClick={() => { setChartMode('asset'); setActiveIndex(-1); }} 
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${chartMode === 'asset' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/50 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                  <PieChartIcon size={14} /> {isFund ? 'Fund' : 'Asset'}
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
                   <div className="flex flex-col items-center justify-center mt-2">
                       <span className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-0.5">TOTAL {chartMode === 'sector' ? (isFund ? 'CATEGORIES' : 'SECTORS') : (isFund ? 'FUNDS' : 'ASSETS')}</span>
                       <span className="text-slate-900 dark:text-white font-display font-black text-4xl md:text-5xl tracking-tighter tabular-nums">{displayData.length}</span>
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
                          <feOffset in="blur" dx="2" dy="4" result="offsetBlur" />
                          <feFlood floodColor="#000" floodOpacity="0.15" result="offsetColor"/>
                          <feComposite in="offsetColor" in2="offsetBlur" operator="in" result="offsetBlur"/>
                          <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur2"/>
                          <feSpecularLighting in="blur2" surfaceScale="2" specularConstant="0.5" specularExponent="20" lightingColor="#fff" result="specOut">
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
                        paddingAngle={3}
                        dataKey="value"
                        label={renderCustomizedLabel}
                        labelLine={false} 
                        filter="url(#realistic-3d)"
                        stroke="none"
                        activeIndex={activeIndex}
                        activeShape={renderActiveShape}
                        onClick={onPieClick}
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
                    <span className="text-sm font-bold opacity-50 uppercase tracking-widest">No Data Available</span>
                  </div>
                )}
            </div>
          </div>
          
          {/* Right: Legend List */}
          <div className="w-full lg:w-2/5 flex flex-col h-[400px] overflow-y-auto custom-scrollbar pr-2 relative z-10">
              <div className="space-y-2 pt-2">
                  {displayData.map((item, idx) => {
                      const percent = (item.value / totalValue) * 100;
                      const isActive = activeIndex === idx;
                      return (
                        <div 
                            key={item.name} 
                            onClick={() => setActiveIndex(isActive ? -1 : idx)}
                            className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300 group border ${isActive ? 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 shadow-sm scale-[1.02]' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                        >
                            <div 
                                className="w-3.5 h-3.5 rounded-[4px] shadow-sm shrink-0 transition-transform duration-300 group-hover:scale-125" 
                                style={{ backgroundColor: item.fill }}
                            ></div>
                            
                            <div className="flex-1 flex justify-between items-center min-w-0">
                                <span className={`text-xs font-display font-bold truncate pr-3 transition-colors ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'}`} title={item.name}>
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-bold tabular-nums hidden sm:block">
                                        Rs. {(item.value / 1000).toFixed(0)}k
                                    </span>
                                    <div className="w-[60px] flex justify-end">
                                        <span className={`text-[11px] font-black tabular-nums px-2 py-1 rounded-md border min-w-[50px] text-center transition-colors ${isActive ? 'bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700 shadow-inner' : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800'}`}>
                                            {percent.toFixed(1)}%
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
