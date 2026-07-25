import React, { useState, useMemo, useEffect } from 'react';
import { Holding } from '../types';
import { Search, AlertTriangle, Clock, FileSpreadsheet, FileText, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown as ArrowDownIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToExcel, exportToCSV } from '../utils/export';

interface HoldingsTableProps {
  holdings: Holding[];
  showBroker?: boolean;
  failedTickers?: Set<string>;
  ldcpMap?: Record<string, number>;
  onTickerClick?: (ticker: string) => void;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

type SortKey = keyof Holding | 'costBasis' | 'marketValue' | 'dailyPL' | 'pnl' | 'pnlPercent';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, showBroker = true, failedTickers = new Set(), ldcpMap = {}, onTickerClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ticker', direction: 'asc' });
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    else if (['quantity', 'avgPrice', 'currentPrice', 'costBasis', 'marketValue', 'dailyPL', 'pnl', 'pnlPercent'].includes(key)) direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredAndSortedHoldings = useMemo(() => {
      let result = holdings;
      if (searchTerm) {
          const term = searchTerm.toLowerCase();
          result = holdings.filter(h => h.ticker.toLowerCase().includes(term) || h.sector.toLowerCase().includes(term) || (showBroker && h.broker?.toLowerCase().includes(term)));
      }
      return [...result].sort((a, b) => {
          let aValue: any = '', bValue: any = '';
          const getVal = (h: Holding, key: SortKey) => {
              const roundedAvg = Math.round(h.avgPrice * 100) / 100;
              const cost = h.quantity * roundedAvg;
              const mkt = h.quantity * h.currentPrice;
              const ldcp = ldcpMap[h.ticker] || h.currentPrice;
              switch (key) {
                  case 'costBasis': return cost;
                  case 'marketValue': return mkt;
                  case 'pnl': return mkt - cost;
                  case 'pnlPercent': return cost > 0 ? ((mkt - cost) / cost) : 0;
                  case 'dailyPL': return (h.currentPrice - ldcp) * h.quantity;
                  default: return h[key as keyof Holding];
              }
          };
          aValue = getVal(a, sortConfig.key); bValue = getVal(b, sortConfig.key);
          if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); bValue = bValue.toLowerCase(); }
          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [holdings, searchTerm, showBroker, sortConfig, ldcpMap]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const totalPages = Math.ceil(filteredAndSortedHoldings.length / itemsPerPage);
  const paginatedHoldings = useMemo(() => { const start = (currentPage - 1) * itemsPerPage; return filteredAndSortedHoldings.slice(start, start + itemsPerPage); }, [filteredAndSortedHoldings, currentPage, itemsPerPage]);

  const totals = useMemo(() => {
      return filteredAndSortedHoldings.reduce((acc, h) => {
          const roundedAvg = Math.round(h.avgPrice * 100) / 100;
          const cost = h.quantity * roundedAvg;
          const marketVal = h.quantity * h.currentPrice;
          const ldcp = ldcpMap[h.ticker] || h.currentPrice;
          const dailyChange = (h.currentPrice - ldcp) * h.quantity;
          return { totalCost: acc.totalCost + cost, totalMarket: acc.totalMarket + marketVal, pnl: acc.pnl + (marketVal - cost), dailyPL: acc.dailyPL + dailyChange };
      }, { totalCost: 0, totalMarket: 0, pnl: 0, dailyPL: 0 });
  }, [filteredAndSortedHoldings, ldcpMap]);

  const totalPnlPercent = totals.totalCost > 0 ? (totals.pnl / totals.totalCost) * 100 : 0;
  const totalDailyPercent = (totals.totalMarket - totals.dailyPL) > 0 ? (totals.dailyPL / (totals.totalMarket - totals.dailyPL)) * 100 : 0;

  const formatUpdateDate = (isoString?: string) => { if (!isoString) return null; return new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const globalLastUpdate = useMemo(() => { if (holdings.length === 0) return null; const times = holdings.map(h => h.lastUpdated).filter((t): t is string => !!t).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); return times.length > 0 ? formatUpdateDate(times[0]) : null; }, [holdings]);

  const handleExport = (type: 'excel' | 'csv') => {
      const data = filteredAndSortedHoldings.map(h => {
          const roundedAvg = Math.round(h.avgPrice * 100) / 100; const cost = h.quantity * roundedAvg; const marketVal = h.quantity * h.currentPrice;
          return { Ticker: h.ticker, Sector: h.sector, Broker: h.broker || 'N/A', Quantity: h.quantity, 'Avg Price': roundedAvg, 'Current Price': h.currentPrice, 'Total Cost': cost, 'Market Value': marketVal, 'P&L': marketVal - cost, 'P&L %': cost > 0 ? ((marketVal - cost) / cost) * 100 : 0, 'Last Update': h.lastUpdated ? formatUpdateDate(h.lastUpdated) : '-' };
      });
      const filename = `Holdings_Export_${new Date().toISOString().split('T')[0]}`;
      if (type === 'excel') exportToExcel(data, filename); else exportToCSV(data, filename);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDownIcon size={12} className="text-emerald-500" />;
  };

  const Th = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey?: SortKey, align?: 'left'|'right'|'center', className?: string }) => (
      <th className={`px-4 py-4 font-bold cursor-pointer select-none group hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors ${className}`} onClick={() => sortKey && handleSort(sortKey)}>
          <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}> 
            {label} {sortKey && <SortIcon column={sortKey} />} 
          </div>
      </th>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden flex flex-col h-full animate-fade-in-up">
        
        {/* Header Section */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-5 bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
             <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Active Holdings</h2>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm tabular-nums"> 
                  {filteredAndSortedHoldings.length} Assets 
                </div>
                {globalLastUpdate && ( 
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-100 dark:border-blue-500/20 shadow-sm"> 
                    <Clock size={12} /> <span>Updated: {globalLastUpdate}</span> 
                  </div> 
                )}
             </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full">
              <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-3 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Filter Ticker, Sector or Broker..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="w-full glass-input rounded-xl pl-11 pr-4 py-2.5 text-sm transition-all" 
                  />
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-1 shadow-sm shrink-0 w-fit">
                  <button onClick={() => handleExport('excel')} className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg transition-colors" title="Export to Excel"> 
                    <FileSpreadsheet size={18} /> 
                  </button>
                  <div className="w-[1px] bg-slate-200 dark:bg-slate-700 my-1 mx-1"></div>
                  <button onClick={() => handleExport('csv')} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition-colors" title="Export to CSV"> 
                    <FileText size={18} /> 
                  </button>
              </div>
          </div>
        </div>
        
        {/* Table Container */}
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
              <tr className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest">
                <Th label="Asset" sortKey="ticker" />
                {showBroker && <Th label="Broker" sortKey="broker" />}
                <Th label="Qty" sortKey="quantity" align="right" />
                <Th label="Avg Price" sortKey="avgPrice" align="right" />
                <Th label="Current" sortKey="currentPrice" align="right" />
                <Th label="Total Cost" sortKey="costBasis" align="right" />
                <Th label="Market Value" sortKey="marketValue" align="right" />
                <Th label="Daily P&L" sortKey="dailyPL" align="right" />
                <Th label="Total P&L" sortKey="pnl" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
              {paginatedHoldings.length === 0 ? (
                <tr> 
                  <td colSpan={showBroker ? 9 : 8} className="px-6 py-20 text-center text-slate-400 italic"> 
                    {searchTerm ? 'No holdings match your filter.' : 'No holdings found. Start by adding a transaction.'} 
                  </td> 
                </tr>
              ) : (
                paginatedHoldings.map((holding, idx) => {
                  const roundedAvg = Math.round(holding.avgPrice * 100) / 100;
                  const costBasis = holding.quantity * roundedAvg; 
                  const marketValue = holding.quantity * holding.currentPrice; 
                  const pnl = marketValue - costBasis; 
                  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0; 
                  const isProfit = pnl >= 0; 
                  const isFailed = failedTickers.has(holding.ticker); 
                  const updateTime = formatUpdateDate(holding.lastUpdated); 
                  const ldcp = ldcpMap[holding.ticker] || holding.currentPrice; 
                  const dailyChange = (holding.currentPrice - ldcp) * holding.quantity; 
                  const dailyPercent = ldcp > 0 ? ((holding.currentPrice - ldcp) / ldcp) * 100 : 0; 
                  const isDailyProfit = dailyChange >= 0;

                  const totalBuyFees = holding.totalCommission + holding.totalTax + holding.totalCDC + holding.totalOtherFees;
                  const estimatedSellFees = totalBuyFees;
                  const sellFeePerShare = holding.quantity > 0 ? estimatedSellFees / holding.quantity : 0;
                  const breakEvenPrice = holding.avgPrice + sellFeePerShare;

                  const diff = holding.currentPrice - breakEvenPrice;
                  let beColorClass = "text-amber-600 dark:text-amber-500"; 
                  if (diff > 0.001) beColorClass = "text-emerald-600 dark:text-emerald-400"; 
                  else if (diff < -0.001) beColorClass = "text-rose-500 dark:text-rose-400"; 

                  return (
                    <tr 
                      key={`${holding.ticker}-${holding.broker || idx}`} 
                      className="even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer" 
                      onClick={() => onTickerClick && onTickerClick(holding.ticker)}
                    >
                      {/* Asset Column */}
                      <td className="px-4 py-4"> 
                        <div className="flex items-center gap-3"> 
                          <div className="w-1 h-8 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div> 
                          <div> 
                            <div className="font-display font-black text-slate-900 dark:text-white text-sm flex items-center gap-2"> 
                              {holding.ticker} 
                              {isFailed && <AlertTriangle size={14} className="text-amber-500 animate-pulse" title="Price update failed" />} 
                            </div> 
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate max-w-[120px] mt-0.5">{holding.sector}</div> 
                          </div> 
                        </div> 
                      </td>
                      
                      {/* Broker */}
                      {showBroker && <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{holding.broker}</td>}
                      
                      {/* Qty */}
                      <td className="px-4 py-4 text-right text-slate-700 dark:text-slate-300 font-bold tabular-nums">
                        {holding.quantity.toLocaleString()}
                      </td>
                      
                      {/* Avg Price */}
                      <td className="px-4 py-4 text-right text-slate-500 dark:text-slate-400 tabular-nums text-sm font-medium">
                          {roundedAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      {/* Current Price & BE */}
                      <td className="px-4 py-4 text-right"> 
                        <div className="flex flex-col items-end"> 
                            <span className={`tabular-nums font-display font-black text-sm ${isFailed ? "text-amber-500" : "text-slate-900 dark:text-white"}`}> 
                                {holding.currentPrice > 0 ? holding.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'} 
                            </span> 
                            {holding.quantity > 0 && (
                                <span className={`text-[10px] font-bold tracking-tight mt-1 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded ${beColorClass}`} title={`Break-Even: Rs. ${breakEvenPrice.toFixed(4)}`}>
                                    BE: {breakEvenPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            )}
                        </div> 
                      </td>
                      
                      {/* Cost Basis */}
                      <td className="px-4 py-4 text-right text-slate-500 dark:text-slate-400 tabular-nums text-sm font-medium">
                        {costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      {/* Market Value */}
                      <td className="px-4 py-4 text-right text-slate-900 dark:text-white font-display font-black tabular-nums text-sm">
                        {marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      
                      {/* Daily P&L */}
                      <td className="px-4 py-4 text-right"> 
                        <div className={`flex flex-col items-end ${isDailyProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> 
                          <span className="font-bold tabular-nums text-sm">
                            {isDailyProfit ? '+' : ''}{dailyChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span> 
                          <span className="text-[10px] font-bold flex items-center gap-0.5 mt-0.5 opacity-90">
                            {isDailyProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {dailyPercent.toFixed(2)}%
                          </span> 
                        </div> 
                      </td>
                      
                      {/* Total P&L */}
                      <td className="px-4 py-4 text-right"> 
                        <div className={`flex flex-col items-end ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> 
                          <span className="font-display font-black tabular-nums text-sm">
                            {isProfit ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span> 
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${isProfit ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                            {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </span> 
                        </div> 
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            
            {/* Grand Total Footer */}
            {filteredAndSortedHoldings.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-900/80 border-t-2 border-slate-200 dark:border-slate-700 shadow-inner">
                    <tr>
                        <td colSpan={showBroker ? 5 : 4} className="px-4 py-5 text-right text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400">
                          Grand Total
                        </td>
                        <td className="px-4 py-5 text-right text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
                          {totals.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-5 text-right text-base font-display font-black tabular-nums text-slate-900 dark:text-white">
                          {totals.totalMarket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-5 text-right"> 
                          <div className={`flex flex-col items-end ${totals.dailyPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> 
                            <span className="font-bold tabular-nums text-sm">
                              {totals.dailyPL >= 0 ? '+' : ''}{totals.dailyPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span> 
                            <span className="text-[10px] font-bold mt-0.5 opacity-90">
                              {totalDailyPercent.toFixed(2)}%
                            </span> 
                          </div> 
                        </td>
                        <td className="px-4 py-5 text-right"> 
                          <div className={`flex flex-col items-end ${totals.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> 
                            <span className="font-display font-black tabular-nums text-base">
                              {totals.pnl >= 0 ? '+' : ''}{totals.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span> 
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${totals.pnl >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                              {totalPnlPercent.toFixed(2)}%
                            </span> 
                          </div> 
                        </td>
                    </tr>
                </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3"> 
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Rows per page:</span> 
              <select 
                value={itemsPerPage} 
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} 
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold py-1.5 px-3 outline-none focus:border-emerald-500 text-slate-700 dark:text-slate-300 shadow-sm"
              > 
                <option value={25}>25</option> <option value={50}>50</option> <option value={100}>100</option> 
              </select> 
            </div>
            <div className="flex items-center gap-4"> 
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 tabular-nums"> 
                {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAndSortedHoldings.length)} of {filteredAndSortedHoldings.length} 
              </span> 
              <div className="flex gap-1.5"> 
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1} 
                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors text-slate-600 dark:text-slate-400 shadow-sm"
                > 
                  <ChevronLeft size={16} /> 
                </button> 
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages} 
                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors text-slate-600 dark:text-slate-400 shadow-sm"
                > 
                  <ChevronRight size={16} /> 
                </button> 
              </div> 
            </div>
        </div>
    </div>
  );
};
