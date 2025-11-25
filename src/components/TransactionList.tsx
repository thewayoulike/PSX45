import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { Trash2, ArrowUpRight, ArrowDownLeft, History, Search, Calendar, X, Filter, Coins, Pencil } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onDelete, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredAndSortedTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          tx.ticker.toLowerCase().includes(searchLower) || 
          (tx.broker && tx.broker.toLowerCase().includes(searchLower));

        const matchesFrom = dateFrom ? tx.date >= dateFrom : true;
        const matchesTo = dateTo ? tx.date <= dateTo : true;

        return matchesSearch && matchesFrom && matchesTo;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = searchTerm || dateFrom || dateTo;

  if (transactions.length === 0) return null;

  return (
    <div className="mt-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 mb-20">
      
      {/* Header & Filters */}
      <div className="p-6 border-b border-slate-200/60 bg-white/40 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
              <History size={20} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Transaction History</h2>
          </div>
          <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
            {filteredAndSortedTransactions.length} / {transactions.length} Entries
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row gap-3">
            {/* Ticker Search */}
            <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search Ticker or Broker..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 outline-none placeholder-slate-400"
                />
            </div>

            {/* Date Range */}
            <div className="flex gap-2">
                <div className="relative">
                    <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                        <Calendar size={16} />
                    </div>
                    <input 
                        type="date" 
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none w-[140px]"
                    />
                </div>
                <div className="flex items-center text-slate-400">-</div>
                <div className="relative">
                    <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                        <Calendar size={16} />
                    </div>
                    <input 
                        type="date" 
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none w-[140px]"
                    />
                </div>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="px-3 py-2 rounded-xl bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                    <X size={16} />
                    Clear
                </button>
            )}
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">
              <th className="px-4 py-4 font-semibold">Date</th>
              <th className="px-4 py-4 font-semibold">Type</th>
              <th className="px-4 py-4 font-semibold">Ticker</th>
              <th className="px-4 py-4 font-semibold">Broker</th>
              <th className="px-4 py-4 font-semibold text-right">Qty</th>
              <th className="px-4 py-4 font-semibold text-right">Price/DPS</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Comm</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Tax</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">CDC</th>
              <th className="px-4 py-4 font-semibold text-right">Net Amount</th>
              <th className="px-4 py-4 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredAndSortedTransactions.length === 0 ? (
                <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-slate-400 italic">
                        {hasActiveFilters ? 'No transactions match your filters.' : 'No transactions found.'}
                    </td>
                </tr>
            ) : (
                filteredAndSortedTransactions.map((tx) => {
                const isBuy = tx.type === 'BUY';
                const isDiv = tx.type === 'DIVIDEND';
                
                const totalFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0);
                const totalAmount = (tx.price * tx.quantity);
                let netAmount = 0;
                
                if (isDiv) {
                    netAmount = totalAmount - (tx.tax || 0);
                } else {
                    netAmount = isBuy ? totalAmount + totalFees : totalAmount - totalFees;
                }

                return (
                    <tr key={tx.id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{tx.date}</td>
                    <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${
                            isDiv ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                            isBuy ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                            {isDiv ? <Coins size={10} /> : (isBuy ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />)}
                            {tx.type}
                        </span>
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-800">{tx.ticker}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{tx.broker || '-'}</td>
                    <td className="px-4 py-4 text-right text-slate-700">{tx.quantity.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-slate-800 font-mono text-xs font-medium">
                        {tx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-slate-400 font-mono text-xs">
                        {(tx.commission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-slate-400 font-mono text-xs">
                        {(tx.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-4 text-right text-slate-400 font-mono text-xs">
                        {(tx.cdcCharges || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-900 font-bold font-mono text-xs">
                        {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(tx);
                                }}
                                className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-all"
                                title="Edit Transaction"
                            >
                                <Pencil size={16} />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(tx.id);
                                }}
                                className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-all"
                                title="Delete Transaction"
                            >
                                <Trash2 size={16} />
                            </button>
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
