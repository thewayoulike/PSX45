import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon, Layers, Search, AlertTriangle } from 'lucide-react';

interface HoldingsTableProps {
  holdings: Holding[];
  showBroker?: boolean;
  onRemoveHolding?: (ticker: string) => void;
  failedTickers?: Set<string>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, showBroker = true, onRemoveHolding, failedTickers = new Set() }) => {
  const [chartMode, setChartMode] = useState<'asset' | 'sector'>('asset');
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredHoldings = useMemo(() => {
      if (!searchTerm) return holdings;
      const term = searchTerm.toLowerCase();
      return holdings.filter(h => 
          h.ticker.toLowerCase().includes(term) || 
          h.sector.toLowerCase().includes(term) ||
          (showBroker && h.broker?.toLowerCase().includes(term))
      );
  }, [holdings, searchTerm, showBroker]);

  const sortedHoldings = [...filteredHoldings].sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity));

  const assetMap = new Map<string, number>();
  sortedHoldings.forEach(h => {
      assetMap.set(h.ticker, (assetMap.get(h.ticker) || 0) + (h.currentPrice * h.quantity));
  });
  const assetChartData = Array.from(assetMap.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0);

  const sectorMap = new Map<string, number>();
  sortedHoldings.forEach(h => {
    const val = h.currentPrice * h.quantity;
    if (val > 0) {
      sectorMap.set(h.sector, (sectorMap.get(h.sector) || 0) + val);
    }
  });
  
  const sectorChartData = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const currentChartData = chartMode === 'asset' ? assetChartData : sectorChartData;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50">
        <div className="p-6 border-b border-slate-200/60 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/40">
          <div className="flex items-center gap-3">
             <h2 className="text-lg font-bold text-slate-800 tracking-tight">Current Holdings</h2>
             <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                {filteredHoldings.length} Assets
             </div>
          </div>
          
          <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Filter Ticker or Sector..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder-slate-400 transition-all"
              />
          </div>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-4 font-semibold">Ticker</th>
                {showBroker && <th className="px-4 py-4 font-semibold">Broker</th>}
                <th className="px-4 py-4 font-semibold text-right">Qty</th>
                <th className="px-4 py-4 font-semibold text-right">Avg</th>
                <th className="px-4 py-4 font-semibold text-right">Current</th>
                <th className="px-2 py-4 font-semibold text-right text-slate-400">Comm</th>
                <th className="px-2 py-4 font-semibold text-right text-slate-400">Tax</th>
                <th className="px-2 py-4 font-semibold text-right text-slate-400">CDC</th>
                <th className="px-2 py-4 font-semibold text-right text-slate-400">Other</th>
                <th className="px-4 py-4 font-semibold text-right">Value</th>
                <th className="px-4 py-4 font-semibold text-right">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sortedHoldings.length === 0 ? (
                <tr>
                  <td colSpan={showBroker ? 11 : 10} className="px-6 py-20 text-center text-slate-400 italic">
                    {searchTerm ? 'No holdings match your filter.' : 'No holdings found. Start by adding a transaction.'}
                  </td>
                </tr>
              ) : (
                sortedHoldings.map((holding, idx) => {
                  const marketValue = holding.quantity * holding.currentPrice;
                  const costBasis = holding.quantity * holding.avgPrice;
                  const pnl = marketValue - costBasis;
                  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                  const isProfit = pnl >= 0;
                  const isFailed = failedTickers.has(holding.ticker);

                  return (
                    <tr key={`${holding.ticker}-${holding.broker || idx}`} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                            <div>
                                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    {holding.ticker}
                                    {isFailed && <AlertTriangle size={14} className="text-amber-500" title="Price update failed or data stale" />}
                                </div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-wide truncate max-w-[100px]">{holding.sector}</div>
                            </div>
                        </div>
                      </td>
                      {showBroker && (
                          <td className="px-4 py-4 text-xs text-slate-500">{holding.broker}</td>
                      )}
                      <td className="px-4 py-4 text-right text-slate-700 font-medium">{holding.quantity.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs">{holding.avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-medium">
                        <span className={isFailed ? "text-amber-600 font-bold" : ""}>
                            {holding.currentPrice > 0 ? holding.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalCommission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalTax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalCDC || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalOtherFees || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      <td className="px-4 py-4 text-right text-slate-900 font-bold font-mono tracking-tight text-xs">
                        {marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className={`flex flex-col items-end ${isProfit ? 'text-emerald-600' : 'text-rose-500'}`}>
                          <span className="font-bold text-sm">{pnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <span className="text-[10px] opacity-80 font-mono">({pnlPercent.toFixed(1)}%)</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl p-6 shadow-xl shadow-slate-200/50 flex flex-col">
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

        <div className="flex-1 min-h-[300px] relative">
          {currentChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={currentChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
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
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-full m-10">
              Empty Portfolio
            </div>
          )}
          
          {currentChartData.length > 0 && (
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <span className="text-slate-400 font-bold text-[10px] uppercase">{chartMode}</span>
                 <span className="text-slate-800 font-bold text-xs tracking-widest">ALLOCATION</span>
             </div>
          )}
        </div>
        <div className="mt-6 space-y-3 overflow-y-auto max-h-[240px] pr-2 custom-scrollbar">
            {currentChartData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-emerald-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                        <span className="text-slate-700 font-medium truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <span className="text-slate-500 font-mono">{(item.value / currentChartData.reduce((a,b) => a + b.value, 0) * 100).toFixed(1)}%</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
