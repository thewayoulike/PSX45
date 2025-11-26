import React, { useState, useMemo } from 'react';
import { RealizedTrade } from '../types';
import { Search, Calendar, X } from 'lucide-react';

interface RealizedTableProps {
  trades: RealizedTrade[];
  showBroker?: boolean;
}

export const RealizedTable: React.FC<RealizedTableProps> = ({ trades, showBroker = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredAndSortedTrades = useMemo(() => {
    return trades
      .filter(trade => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          trade.ticker.toLowerCase().includes(term) || 
          (trade.broker && trade.broker.toLowerCase().includes(term));
        
        const matchesFrom = dateFrom ? trade.date >= dateFrom : true;
        const matchesTo = dateTo ? trade.date <= dateTo : true;

        return matchesSearch && matchesFrom && matchesTo;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [trades, searchTerm, dateFrom, dateTo]);

  const clearFilters = () => {
      setSearchTerm('');
      setDateFrom('');
      setDateTo('');
  };
  
  const hasActiveFilters = searchTerm || dateFrom || dateTo;

  return (
    <div className="mt-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50">
      <div className="p-6 border-b border-slate-200/60 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/40">
        <div className="flex items-center gap-2 min-w-fit">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Realized History</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 whitespace-nowrap font-medium">Sold Positions</span>
            <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 ml-2">
               {filteredAndSortedTrades.length} / {trades.length}
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
             <div className="relative flex-grow md:flex-grow-0 md:w-48">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search Ticker..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder-slate-400"
                />
            </div>

            <div className="flex gap-1 items-center">
                 <input 
                    type="date" 
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none w-28"
                 />
                 <span className="text-slate-400">-</span>
                 <input 
                    type="date" 
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none w-28"
                 />
            </div>

             {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="p-2 rounded-lg bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors"
                    title="Clear Filters"
                >
                    <X size={14} />
                </button>
            )}
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">
              <th className="px-4 py-4 font-semibold">Date</th>
              <th className="px-4 py-4 font-semibold">Ticker</th>
              {showBroker && <th className="px-4 py-4 font-semibold">Broker</th>}
              <th className="px-4 py-4 font-semibold text-right">Qty</th>
              <th className="px-4 py-4 font-semibold text-right">Buy Avg</th>
              <th className="px-4 py-4 font-semibold text-right">Sell Price</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Comm</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Tax</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">CDC</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Other</th>
              <th className="px-4 py-4 font-semibold text-right">Net Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredAndSortedTrades.length === 0 ? (
              <tr>
                <td colSpan={showBroker ? 11 : 10} className="px-6 py-10 text-center text-slate-400 italic">
                  {hasActiveFilters ? 'No trades match your filters.' : 'No realized trades yet.'}
                </td>
              </tr>
            ) : (
              filteredAndSortedTrades.map((trade) => {
                const isProfit = trade.profit >= 0;
                return (
                  <tr key={trade.id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{trade.date}</td>
                    <td className="px-4 py-4 font-bold text-slate-800">{trade.ticker}</td>
                    {showBroker && (
                        <td className="px-4 py-4 text-xs text-slate-500">{trade.broker || '-'}</td>
                    )}
                    <td className="px-4 py-4 text-right text-slate-700">{trade.quantity.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-slate-500 font-mono text-xs">
                        {(trade.buyAvg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-medium">
                        {(trade.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">
                        {(trade.commission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">
                        {(trade.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">
                        {(trade.cdcCharges || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-rose-400 font-mono text-[10px]">
                        {(trade.otherFees || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4 text-right">
                        <div className={`font-bold text-sm ${isProfit ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isProfit ? '+' : ''}{trade.profit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
