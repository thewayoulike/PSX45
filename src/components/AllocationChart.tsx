import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers } from 'lucide-react';

interface AllocationChartProps {
  holdings: Holding[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

export const AllocationChart: React.FC<AllocationChartProps> = ({ holdings }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('asset');

  const currentChartData = useMemo(() => {
    const data = [...holdings].sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity));

    if (chartMode === 'asset') {
        const assetMap = new Map<string, number>();
        data.forEach(h => {
            assetMap.set(h.ticker, (assetMap.get(h.ticker) || 0) + (h.currentPrice * h.quantity));
        });
        return Array.from(assetMap.entries())
            .map(([name, value]) => ({ name, value }))
            .filter(item => item.value > 0);
    } else {
        const sectorMap = new Map<string, number>();
        data.forEach(h => {
            const val = h.currentPrice * h.quantity;
            if (val > 0) {
                sectorMap.set(h.sector, (sectorMap.get(h.sector) || 0) + val);
            }
        });
        return Array.from(sectorMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }
  }, [holdings, chartMode]);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl p-6 shadow-xl shadow-slate-200/50 flex flex-col h-fit">
      <div className="flex justify-between items-center mb-6">
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
      <div className="flex flex-col sm:flex-row gap-4 items-start h-[240px]">
          
          {/* Chart Side (Left) - 40% Width */}
          <div className="w-full sm:w-[40%] h-full relative min-h-[180px]">
            {currentChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={currentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {currentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
            
            {currentChartData.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                   <span className="text-slate-400 font-bold text-[9px] uppercase">{chartMode}</span>
               </div>
            )}
          </div>
          
          {/* List Side (Right) - 60% Width */}
          <div className="w-full sm:w-[60%] h-full overflow-y-auto custom-scrollbar pr-1">
              <div className="space-y-2">
                  {currentChartData.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-emerald-50/50 transition-colors border border-transparent hover:border-emerald-100">
                          <div className="flex items-center gap-2 overflow-hidden">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                              <span className="text-slate-700 font-bold truncate" title={item.name}>{item.name}</span>
                          </div>
                          <span className="text-slate-500 font-mono whitespace-nowrap">{(item.value / currentChartData.reduce((a,b) => a + b.value, 0) * 100).toFixed(1)}%</span>
                      </div>
                  ))}
              </div>
          </div>

      </div>
    </div>
  );
};
