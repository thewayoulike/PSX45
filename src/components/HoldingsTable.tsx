import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { Search, AlertTriangle, Clock, FileSpreadsheet, FileText, TrendingUp, TrendingDown } from 'lucide-react'; // Added Icons
import { exportToExcel, exportToCSV } from '../utils/export'; // Import Utility

interface HoldingsTableProps {
  holdings: Holding[];
  showBroker?: boolean;
  failedTickers?: Set<string>;
  // NEW: Pass the LDCP map to calculate daily change
  ldcpMap?: Record<string, number>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, showBroker = true, failedTickers = new Set(), ldcpMap = {} }) => {
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

  // --- CALCULATE GRAND TOTALS ---
  const totals = useMemo(() => {
      return sortedHoldings.reduce((acc, h) => {
          const marketVal = h.quantity * h.currentPrice;
          const cost = h.quantity * h.avgPrice;
          
          // Daily Change Calculation
          const ldcp = ldcpMap[h.ticker] || h.currentPrice; // If no LDCP, assume no change
          const dailyChange = (h.currentPrice - ldcp) * h.quantity;

          return {
              comm: acc.comm + (h.totalCommission || 0),
              tax: acc.tax + (h.totalTax || 0),
              cdc: acc.cdc + (h.totalCDC || 0),
              other: acc.other + (h.totalOtherFees || 0),
              totalCost: acc.totalCost + cost,
              totalMarket: acc.totalMarket + marketVal,
              pnl: acc.pnl + (marketVal - cost),
              dailyPL: acc.dailyPL + dailyChange // Accumulate Daily P&L
          };
      }, { comm: 0, tax: 0, cdc: 0, other: 0, totalCost: 0, totalMarket: 0, pnl: 0, dailyPL: 0 });
  }, [sortedHoldings, ldcpMap]);

  const totalPnlPercent = totals.totalCost > 0 ? (totals.pnl / totals.totalCost) * 100 : 0;

  const formatUpdateDate = (isoString?: string) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  const globalLastUpdate = useMemo(() => {
      if (holdings.length === 0) return null;
      const times = holdings.map(h => h.lastUpdated).filter((t): t is string => !!t)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      if (times.length > 0) return formatUpdateDate(times[0]);
      return null;
  }, [holdings]);

  // NEW: Export Handler
  const handleExport = (type: 'excel' | 'csv') => {
      const data = sortedHoldings.map(h => {
          const marketVal = h.quantity * h.currentPrice;
          const cost = h.quantity * h.avgPrice;
          return {
              Ticker: h.ticker,
              Sector: h.sector,
              Broker: h.broker || 'N/A',
              Quantity: h.quantity,
              'Avg Price': h.avgPrice,
              'Current Price': h.currentPrice,
              'Total Cost': cost,
              'Market Value': marketVal,
              'P&L': marketVal - cost,
              'P&L %': cost > 0 ? ((marketVal - cost) / cost) * 100 : 0,
              'Last Update': h.lastUpdated ? formatUpdateDate(h.lastUpdated) : '-'
          };
      });

      const filename = `Holdings_Export_${new Date().toISOString().split('T')[0]}`;
      if (type === 'excel') exportToExcel(data, filename);
      else exportToCSV(data, filename);
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 h-full">
        <div className="p-6 border-b border-slate-200/60 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/40">
          
          <div className="flex flex-wrap items-center gap-3">
             <h2 className="text-lg font-bold text-slate-800 tracking-tight">Current Holdings</h2>
             <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                {filteredHoldings.length} Assets
             </div>
             {globalLastUpdate && (
                 <div className="flex items-center gap-1.5 text-[10px] text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 ml-1 shadow-sm">
                     <Clock size={12} className="text-blue-600" />
                     <span>Last Price Update: {globalLastUpdate}</span>
                 </div>
             )}
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Filter..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
              </div>
              {/* EXPORT BUTTONS */}
              <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                  <button onClick={() => handleExport('excel')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Download Excel">
                      <FileSpreadsheet size={18} />
                  </button>
                  <div className="w-[1px] bg-slate-100 my-1 mx-0.5"></div>
                  <button onClick={() => handleExport('csv')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download CSV">
                      <FileText size={18} />
                  </button>
              </div>
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
                <th className="px-4 py-4 font-semibold text-right">Total Cost</th>
                <th className="px-4 py-4 font-semibold text-right">Market Value</th>
                <th className="px-4 py-4 font-semibold text-right">Daily P&L</th> 
                <th className="px-4 py-4 font-semibold text-right">Total P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sortedHoldings.length === 0 ? (
                <tr>
                  <td colSpan={showBroker ? 9 : 8} className="px-6 py-20 text-center text-slate-400 italic">
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
                  const updateTime = formatUpdateDate(holding.lastUpdated);

                  // Daily P&L Calculation
                  const ldcp = ldcpMap[holding.ticker] || holding.currentPrice;
                  const dailyChange = (holding.currentPrice - ldcp) * holding.quantity;
                  const dailyPercent = ldcp > 0 ? ((holding.currentPrice - ldcp) / ldcp) * 100 : 0;
                  const isDailyProfit = dailyChange >= 0;

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
                      
                      {/* QTY: No Decimals */}
                      <td className="px-4 py-4 text-right text-slate-700 font-medium">{holding.quantity.toLocaleString()}</td>
                      
                      {/* AVG PRICE: 2 Decimals */}
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs">{holding.avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      
                      {/* CURRENT PRICE: 2 Decimals */}
                      <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-medium">
                        <div className="flex flex-col items-end">
                            <span className={isFailed ? "text-amber-600 font-bold" : ""}>
                                {holding.currentPrice > 0 ? holding.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                            </span>
                            {updateTime && (
                                <span className="text-[9px] text-slate-300 font-sans mt-0.5 group-hover:text-slate-400 transition-colors">
                                    {updateTime}
                                </span>
                            )}
                        </div>
                      </td>

                      {/* TOTAL COST: 2 Decimals */}
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs font-medium">
                        {costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      {/* MARKET VALUE: 2 Decimals */}
                      <td className="px-4 py-4 text-right text-slate-900 font-bold font-mono tracking-tight text-xs">
                        {marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      {/* DAILY P&L: 2 Decimals */}
                      <td className="px-4 py-4 text-right">
                        <div className={`flex flex-col items-end ${isDailyProfit ? 'text-emerald-600' : 'text-rose-500'}`}>
                            <span className="font-bold text-xs">
                                {isDailyProfit ? '+' : ''}{dailyChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[9px] opacity-80 font-mono flex items-center gap-0.5">
                                {isDailyProfit ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                                {dailyPercent.toFixed(2)}%
                            </span>
                        </div>
                      </td>

                      {/* TOTAL P&L: 2 Decimals */}
                      <td className="px-4 py-4 text-right">
                        <div className={`flex flex-col items-end ${isProfit ? 'text-emerald-600' : 'text-rose-500'}`}>
                          <span className="font-bold text-sm">{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] opacity-80 font-mono">({pnlPercent.toFixed(2)}%)</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            
            {sortedHoldings.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-slate-800 font-bold shadow-inner">
                    <tr>
                        <td colSpan={showBroker ? 5 : 4} className="px-4 py-4 text-right text-xs uppercase tracking-wider text-slate-500">
                            Grand Total
                        </td>
                        
                        <td className="px-4 py-4 text-right text-xs font-mono text-slate-700">
                            {totals.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-4 text-right text-xs font-mono text-slate-900">
                            {totals.totalMarket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-4 text-right">
                            <div className={`flex flex-col items-end ${totals.dailyPL >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                <span className="font-bold text-xs">
                                    {totals.dailyPL >= 0 ? '+' : ''}
                                    {totals.dailyPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                            <div className={`flex flex-col items-end ${totals.pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                <span className="font-bold text-sm">
                                    {totals.pnl >= 0 ? '+' : ''}
                                    {totals.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] opacity-80 font-mono">
                                    ({totalPnlPercent.toFixed(2)}%)
                                </span>
                            </div>
                        </td>
                    </tr>
                </tfoot>
            )}
          </table>
        </div>
    </div>
  );
};
