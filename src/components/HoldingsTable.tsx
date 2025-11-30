import React, { useState, useMemo } from 'react';
import { Holding } from '../types';
import { Search, AlertTriangle, Clock, FileSpreadsheet, FileText, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { exportToExcel, exportToCSV } from '../utils/export';

interface HoldingsTableProps {
  holdings: Holding[];
  showBroker?: boolean;
  failedTickers?: Set<string>;
  ldcpMap?: Record<string, number>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6'];

type SortKey = keyof Holding | 'costBasis' | 'marketValue' | 'dailyPL' | 'pnl' | 'pnlPercent';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, showBroker = true, failedTickers = new Set(), ldcpMap = {} }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // DEFAULT SORTING: Ticker Ascending
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ticker', direction: 'asc' });

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    // If clicking same key, toggle. Default for numbers is usually desc first, but simple toggle is fine.
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    } else {
        // If new key is numeric, default to desc (highest first usually better for money)
        if (['quantity', 'avgPrice', 'currentPrice', 'costBasis', 'marketValue', 'dailyPL', 'pnl', 'pnlPercent'].includes(key)) {
            direction = 'desc';
        }
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedHoldings = useMemo(() => {
      // 1. Filter
      let result = holdings;
      if (searchTerm) {
          const term = searchTerm.toLowerCase();
          result = holdings.filter(h => 
              h.ticker.toLowerCase().includes(term) || 
              h.sector.toLowerCase().includes(term) ||
              (showBroker && h.broker?.toLowerCase().includes(term))
          );
      }

      // 2. Sort
      return [...result].sort((a, b) => {
          let aValue: any = '';
          let bValue: any = '';

          // Derived values calculation
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

          aValue = getVal(a, sortConfig.key);
          bValue = getVal(b, sortConfig.key);

          // String sort
          if (typeof aValue === 'string') {
              aValue = aValue.toLowerCase();
              bValue = bValue.toLowerCase();
          }

          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [holdings, searchTerm, showBroker, sortConfig, ldcpMap]);

  const totals = useMemo(() => {
      return filteredAndSortedHoldings.reduce((acc, h) => {
          const roundedAvg = Math.round(h.avgPrice * 100) / 100;
          const cost = h.quantity * roundedAvg;
          const marketVal = h.quantity * h.currentPrice;
          const ldcp = ldcpMap[h.ticker] || h.currentPrice;
          const dailyChange = (h.currentPrice - ldcp) * h.quantity;

          return {
              totalCost: acc.totalCost + cost,
              totalMarket: acc.totalMarket + marketVal,
              pnl: acc.pnl + (marketVal - cost),
              dailyPL: acc.dailyPL + dailyChange
          };
      }, { totalCost: 0, totalMarket: 0, pnl: 0, dailyPL: 0 });
  }, [filteredAndSortedHoldings, ldcpMap]);

  const totalPnlPercent = totals.totalCost > 0 ? (totals.pnl / totals.totalCost) * 100 : 0;
  
  const yesterdayTotalMarket = totals.totalMarket - totals.dailyPL;
  const totalDailyPercent = yesterdayTotalMarket > 0 ? (totals.dailyPL / yesterdayTotalMarket) * 100 : 0;

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

  const handleExport = (type: 'excel' | 'csv') => {
      const data = filteredAndSortedHoldings.map(h => {
          const roundedAvg = Math.round(h.avgPrice * 100) / 100;
          const cost = h.quantity * roundedAvg;
          const marketVal = h.quantity * h.currentPrice;
          
          return {
              Ticker: h.ticker,
              Sector: h.sector,
              Broker: h.broker || 'N/A',
              Quantity: h.quantity,
              'Avg Price': roundedAvg, 
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

  const SortIcon = ({ column }: { column: SortKey }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />;
  };

  const Th = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey?: SortKey, align?: 'left'|'right'|'center', className?: string }) => (
      <th 
          className={`px-4 py-4 font-semibold cursor-pointer select-none group hover:bg-slate-100 transition-colors ${className}`}
          onClick={() => sortKey && handleSort(sortKey)}
      >
          <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
              {label}
              {sortKey && <SortIcon column={sortKey} />}
          </div>
      </th>
  );

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 h-full">
        <div className="p-6 border-b border-slate-200/60 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/40">
          
          <div className="flex flex-wrap items-center gap-3">
             <h2 className="text-lg font-bold text-slate-800 tracking-tight">Current Holdings</h2>
             <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                {filteredAndSortedHoldings.length} Assets
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
                <Th label="Ticker" sortKey="ticker" />
                {showBroker && <Th label="Broker" sortKey="broker" />}
                <Th label="Qty" sortKey="quantity" align="right" />
                <Th label="Avg" sortKey="avgPrice" align="right" />
                <Th label="Current" sortKey="currentPrice" align="right" />
                <Th label="Total Cost" sortKey="costBasis" align="right" />
                <Th label="Market Value" sortKey="marketValue" align="right" />
                <Th label="Daily P&L" sortKey="dailyPL" align="right" />
                <Th label="Total P&L" sortKey="pnl" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredAndSortedHoldings.length === 0 ? (
                <tr>
                  <td colSpan={showBroker ? 9 : 8} className="px-6 py-20 text-center text-slate-400 italic">
                    {searchTerm ? 'No holdings match your filter.' : 'No holdings found. Start by adding a transaction.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedHoldings.map((holding, idx) => {
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
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs">
                          {roundedAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
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
                      <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs font-medium">
                        {costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-900 font-bold font-mono tracking-tight text-xs">
                        {marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
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
            
            {filteredAndSortedHoldings.length > 0 && (
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
                                <span className="text-[10px] opacity-80 font-mono">
                                    ({totalDailyPercent.toFixed(2)}%)
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
