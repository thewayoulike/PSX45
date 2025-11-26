import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
}

// Extended Palette for many items
const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', 
  '#06b6d4', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', 
  '#e11d48', '#f97316', '#a855f7', '#0ea5e9', '#22c55e'
];

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('asset');

  const displayData = useMemo(() => {
    // 1. Aggregate Data based on mode
    let rawData: { name: string; value: number }[] = [];

    if (chartMode === 'asset') {
        const assetMap = new Map<string, number>();
        holdings.forEach(h => {
            assetMap.set(h.ticker, (assetMap.get(h.ticker) || 0) + (h.currentPrice * h.quantity));
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

    // 2. Sort by Value Descending
    rawData.sort((a, b) => b.value - a.value);

    return rawData;
  }, [holdings, chartMode]);

  const totalValue = displayData.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl p-6 shadow-xl shadow-slate-200/50 flex flex-col h-fit w-full">
      <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Allocation</h2>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button onClick={() => setChartMode('asset')} className={`p-1.5 rounded transition-all ${chartMode === 'asset' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="By Asset">
                  <PieChartIcon size={16} />
              </button>
              <button onClick={() => setChartMode('sector')} className={`p-1.5 rounded transition-all ${chartMode === 'sector' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="By Sector">
                  <Layers size={16} />
              </button>
          </div>
      </div>

      {/* Horizontal Content Container */}
      <div className="flex flex-col md:flex-row items-center gap-8 h-full">
          
          {/* Chart Side - Increased Size */}
          <div className="w-full md:w-[350px] h-[320px] relative shrink-0">
            {displayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={displayData}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}  
                    outerRadius={130} 
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {displayData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} itemStyle={{ color: '#64748b' }} formatter={(value: number) => `Rs. ${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-full m-4">
                Empty
              </div>
            )}
            
            {displayData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                   <span className="text-slate-400 font-bold text-[10px] uppercase">{chartMode}</span>
                   <span className="text-slate-800 font-bold text-lg tracking-widest">MIX</span>
               </div>
            )}
          </div>
          
          {/* List Side - Grid Layout */}
          <div className="flex-1 h-[320px] overflow-y-auto custom-scrollbar w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 pr-2">
                  {displayData.map((item, idx) => {
                      return (
                        <div key={item.name} className="flex items-center justify-between text-xs p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-emerald-50/50 hover:border-emerald-100 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                <span className="font-bold truncate text-slate-700" title={item.name}>
                                    {item.name}
                                </span>
                            </div>
                            <span className="text-slate-600 font-mono font-medium whitespace-nowrap">
                                {(item.value / totalValue * 100).toFixed(1)}%
                            </span>
                        </div>
                      );
                  })}
              </div>
          </div>

      </div>
    </div>
  );
};
