import React, { useState, useMemo, useEffect } from 'react';
import { RealizedTrade } from '../types';
import { Search, X, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToExcel, exportToCSV } from '../utils/export';

interface RealizedTableProps {
  trades: RealizedTrade[];
  showBroker?: boolean;
}

type SortKey = keyof RealizedTrade | 'totalCost' | 'totalSell';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const RealizedTable: React.FC<RealizedTableProps> = ({ trades, showBroker = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

  // Pagination State
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedTrades = useMemo(() => {
    // 1. Filter
    const filtered = trades.filter(trade => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        trade.ticker.toLowerCase().includes(term) || 
        (trade.broker && trade.broker.toLowerCase().includes(term));
      
      const matchesFrom = dateFrom ? trade.date >= dateFrom : true;
      const matchesTo = dateTo ? trade.date <= dateTo : true;

      return matchesSearch && matchesFrom && matchesTo;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof RealizedTrade];
      let bValue: any = b[sortConfig.key as keyof RealizedTrade];

      if (sortConfig.key === 'totalCost') {
        aValue = (a.buyAvg || 0) * a.quantity;
        bValue = (b.buyAvg || 0) * b.quantity;
      } else if (sortConfig.key === 'totalSell') {
        aValue = (a.sellPrice || 0) * a.quantity;
        bValue = (b.sellPrice || 0) * b.quantity;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, searchTerm, dateFrom, dateTo, sortConfig]);

  // Reset page when filters change
  useEffect(() => {
      setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredAndSortedTrades.length / itemsPerPage);
  const paginatedTrades = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return filteredAndSortedTrades.slice(start, start + itemsPerPage);
  }, [filteredAndSortedTrades, currentPage, itemsPerPage]);

  // Calculate Grand Totals (On filtered set, not just paginated)
  const totals = useMemo(() => {
      return filteredAndSortedTrades.reduce((acc, t) => {
          const cost = (t.buyAvg || 0) * t.quantity;
          const sell = (t.sellPrice || 0) * t.quantity;
          return {
              qty: acc.qty + t.quantity,
              cost: acc.cost + cost,
              sell: acc.sell + sell,
              comm: acc.comm + (t.commission || 0),
              tax: acc.tax + (t.tax || 0),
              cdc: acc.cdc + (t.cdcCharges || 0),
              other: acc.other + (t.otherFees || 0),
              profit: acc.profit + t.profit
          };
      }, { qty: 0, cost: 0, sell: 0, comm: 0, tax: 0, cdc: 0, other: 0, profit: 0 });
  }, [filteredAndSortedTrades]);

  const clearFilters = () => {
      setSearchTerm(''); setDateFrom(''); setDateTo('');
  };
  
  const hasActiveFilters = searchTerm || dateFrom || dateTo;

  const handleExport = (type: 'excel' | 'csv') => {
      const data = filteredAndSortedTrades.map(trade => {
          const totalCost = (trade.buyAvg || 0) * trade.quantity;
          const totalSell = (trade.sellPrice || 0) * trade.quantity;
          return {
              Date: trade.date,
              Ticker: trade.ticker,
              Broker: trade.broker || 'N/A',
              Quantity: trade.quantity,
              'Buy Avg': trade.buyAvg,
              'Sell Price': trade.sellPrice,
              'Total Cost': totalCost,
              'Total Sell': totalSell,
              'Net Profit': trade.profit,
              Commission: trade.commission,
              Tax: trade.tax,
              CDC: trade.cdcCharges,
              Other: trade.otherFees
          };
      });

      const filename = `Realized_Gains_Export_${new Date().toISOString().split('T')[0]}`;
      if (type === 'excel') exportToExcel(data, filename);
      else exportToCSV(data, filename);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />;
  };

  const Th = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey?: SortKey, align?: 'left'|'right'|'center', className?: string }) => (
      <th 
          className={`px-4 py-4 font-semibold text-slate-600 cursor-pointer select-none group hover:bg-slate-100 transition-colors ${className}`}
          onClick={() => sortKey && handleSort(sortKey)}
      >
          <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
              {label}
              {sortKey && <SortIcon column={sortKey} />}
          </div>
      </th>
  );

  return (
    <div className="mt-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50">
      
      {/* RESPONSIVE HEADER */}
      <div className="p-6 border-b border-slate-200/60 flex flex-col lg:flex-row justify-between gap-4 bg-white/40">
        
        {/* Title and Count */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight whitespace-nowrap">Realized History</h2>
            <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 whitespace-nowrap font-medium">Sold Positions</span>
                <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                   {filteredAndSortedTrades.length} / {trades.length}
                </div>
            </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
             
             {/* Search */}
             <div className="relative flex-grow sm:w-48">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search Ticker..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder-slate-400"
                />
            </div>

            {/* Date Range */}
            <div className="flex gap-2 items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shrink-0">
                 <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent border-none text-xs text-slate-600 focus:ring-0 outline-none w-24 p-0" />
                 <span className="text-slate-300">-</span>
                 <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent border-none text-xs text-slate-600 focus:ring-0 outline-none w-24 p-0" />
            </div>

            <div className="flex gap-2 shrink-0">
                 {/* Export Buttons */}
                 <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                      <button onClick={() => handleExport('excel')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Export Excel">
                          <FileSpreadsheet size={16} />
                      </button>
                      <div className="w-[1px] bg-slate-100 my-1 mx-0.5"></div>
                      <button onClick={() => handleExport('csv')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Export CSV">
                          <FileText size={16} />
                      </button>
                 </div>

                 {hasActiveFilters && (
                    <button onClick={clearFilters} className="p-2 rounded-lg bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors" title="Clear Filters">
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">
              <Th label="Date" sortKey="date" />
              <Th label="Ticker" sortKey="ticker" />
              {showBroker && <Th label="Broker" sortKey="broker" />}
              <Th label="Qty" sortKey="quantity" align="right" />
              <Th label="Buy Avg" sortKey="buyAvg" align="right" />
              <Th label="Sell Price" sortKey="sellPrice" align="right" />
              <Th label="Total Cost" sortKey="totalCost" align="right" />
              <Th label="Total Sell" sortKey="totalSell" align="right" />
              <Th label="Comm" sortKey="commission" align="right" className="text-slate-400" />
              <Th label="Tax" sortKey="tax" align="right" className="text-slate-400" />
              <Th label="CDC" sortKey="cdcCharges" align="right" className="text-slate-400" />
              <Th label="Other" sortKey="otherFees" align="right" className="text-slate-400" />
              <Th label="Net Profit" sortKey="profit" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {paginatedTrades.length === 0 ? (
              <tr>
                <td colSpan={showBroker ? 13 : 12} className="px-6 py-10 text-center text-slate-400 italic">
                  {hasActiveFilters ? 'No trades match your filters.' : 'No realized trades yet.'}
                </td>
              </tr>
            ) : (
              paginatedTrades.map((trade) => {
                const isProfit = trade.profit >= 0;
                const totalCost = (trade.buyAvg || 0) * trade.quantity;
                const totalSell = (trade.sellPrice || 0) * trade.quantity;

                return (
                  <tr key={trade.id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{trade.date}</td>
                    <td className="px-4 py-4 font-bold text-slate-800">{trade.ticker}</td>
                    {showBroker && <td className="px-4 py-4 text-xs text-slate-500">{trade.broker || '-'}</td>}
                    <td className="px-4 py-4 text-right text-slate-700">{trade.quantity.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs">{(trade.buyAvg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-medium">{(trade.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right text-slate-600 font-mono text-xs font-medium">{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-bold">{totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">{(trade.commission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">{(trade.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">{(trade.cdcCharges || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">{(trade.otherFees || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right">
                        <div className={`font-bold text-sm ${isProfit ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isProfit ? '+' : ''}{trade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          
          {/* GRAND TOTALS FOOTER */}
          {filteredAndSortedTrades.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800 shadow-inner">
                  <tr>
                      <td colSpan={showBroker ? 3 : 2} className="px-4 py-4 text-right uppercase tracking-wider text-slate-500">Totals</td>
                      <td className="px-4 py-4 text-right">{totals.qty.toLocaleString()}</td>
                      <td colSpan={2} className="px-4 py-4"></td>
                      <td className="px-4 py-4 text-right">{totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-4 text-right">{totals.sell.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right text-rose-500">{totals.comm.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right text-rose-500">{totals.tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right text-rose-500">{totals.cdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right text-rose-500">{totals.other.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-4 py-4 text-right text-sm ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {totals.profit >= 0 ? '+' : ''}{totals.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                  </tr>
              </tfoot>
          )}
        </table>
      </div>

      {/* PAGINATION FOOTER */}
      <div className="p-4 border-t border-slate-200/60 bg-white/40 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Rows per page:</span>
              <select 
                  value={itemsPerPage} 
                  onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 outline-none focus:border-emerald-500 cursor-pointer"
              >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
              </select>
          </div>

          <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">
                  {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAndSortedTrades.length)} of {filteredAndSortedTrades.length}
              </span>
              <div className="flex gap-1">
                  <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                      <ChevronLeft size={16} className="text-slate-600" />
                  </button>
                  <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                      <ChevronRight size={16} className="text-slate-600" />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};
