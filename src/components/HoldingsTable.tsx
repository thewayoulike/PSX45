import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { Search, AlertTriangle } from 'lucide-react';

interface HoldingsTableProps {
  holdings: Holding[];
  showBroker?: boolean;
  failedTickers?: Set<string>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, showBroker = true, failedTickers = new Set() }) => {
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

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 h-full">
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
                <th className="px-4 py-4 font-semibold text-right">Total Cost</th>
                <th className="px-4 py-4 font-semibold text-right">Market Value</th>
                <th className="px-4 py-4 font-semibold text-right">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sortedHoldings.length === 0 ? (
                <tr>
                  <td colSpan={showBroker ? 12 : 11} className="px-6 py-20 text-center text-slate-400 italic">
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
                        {(holding.totalCommission || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalTax || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalCDC || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-4 text-right text-slate-400 font-mono text-[10px]">
                        {(holding.totalOtherFees || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs font-medium">
                        {costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  );
};
