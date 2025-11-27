import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { Trash2, ArrowUpRight, ArrowDownLeft, History, Search, Calendar, X, Filter, Coins, Pencil, Receipt, Wallet } from 'lucide-react';
import { TaxIcon } from './ui/TaxIcon'; 
import { DepositIcon } from './ui/DepositIcon'; // Import the new Deposit component

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onDelete, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredAndSortedTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          tx.ticker.toLowerCase().includes(searchLower) || 
          (tx.broker && tx.broker.toLowerCase().includes(searchLower)) ||
          (tx.notes && tx.notes.toLowerCase().includes(searchLower));

        const matchesFrom = dateFrom ? tx.date >= dateFrom : true;
        const matchesTo = dateTo ? tx.date <= dateTo : true;

        const matchesType = filterType === 'ALL' || tx.type === filterType;

        return matchesSearch && matchesFrom && matchesTo && matchesType;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, dateFrom, dateTo, filterType]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = searchTerm || dateFrom || dateTo || filterType !== 'ALL';

  // Helper to get style and icon based on type
  const getTypeConfig = (tx: Transaction) => {
      switch (tx.type) {
          case 'BUY':
              return { 
                  style: 'bg-emerald-50 text-emerald-600 border-emerald-100', 
                  icon: <ArrowDownLeft size={10} />,
                  label: 'BUY'
              };
          case 'SELL':
              return { 
                  style: 'bg-rose-50 text-rose-600 border-rose-100', 
                  icon: <ArrowUpRight size={10} />,
                  label: 'SELL'
              };
          case 'DIVIDEND':
              return { 
                  style: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-extrabold', 
                  icon: <Coins size={10} />,
                  label: 'DIVIDEND'
              };
          case 'TAX':
              return { 
                  style: 'bg-rose-50 text-rose-600 border-rose-100', 
                  icon: <TaxIcon className="w-3 h-3" />,
                  label: 'TAX' 
              };
          case 'HISTORY':
              const isPositive = tx.price >= 0;
              return { 
                  style: isPositive 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                      : 'bg-rose-50 text-rose-600 border-rose-100',
                  icon: <History size={10} />,
                  label: 'Historical P&L'
              };
          case 'DEPOSIT':
              return { 
                  style: 'bg-blue-50 text-blue-600 border-blue-100', 
                  // Use the new DepositIcon here
                  icon: <DepositIcon className="w-4 h-4" />,
                  label: 'DEPOSIT'
              };
          case 'WITHDRAWAL':
              return { 
                  style: 'bg-rose-50 text-rose-600 border-rose-100', 
                  icon: <Wallet size={10} />,
                  label: 'WITHDRAWAL'
              };
          default:
              return { 
                  style: 'bg-slate-50 text-slate-600 border-slate-200', 
                  icon: <ArrowUpRight size={10} />,
                  label: tx.type
              };
      }
  };

  if (transactions.length === 0) return null;

  return (
    <div className="mt-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 mb-20">
      
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

        <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search Ticker, Broker or Notes..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 outline-none placeholder-slate-400"
                />
            </div>

            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative w-full sm:w-auto">
                    <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                        <Filter size={16} />
                    </div>
                    <select 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value)} 
                        className="w-full sm:w-[130px] bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                    >
                        <option value="ALL">All Types</option>
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                        <option value="DIVIDEND">Dividend</option>
                        <option value="TAX">Tax / CGT</option>
                        <option value="HISTORY">History</option>
                        <option value="DEPOSIT">Deposit</option>
                        <option value="WITHDRAWAL">Withdrawal</option>
                    </select>
                </div>

                <div className="flex gap-2 items-center bg-white border border-slate-200 rounded-xl px-2 py-0.5">
                    <input 
                        type="date" 
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none w-[110px] py-2"
                        title="From Date"
                    />
                    <span className="text-slate-300 text-xs">to</span>
                    <input 
                        type="date" 
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none w-[110px] py-2"
                         title="To Date"
                    />
                </div>
            </div>

            {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="px-3 py-2 rounded-xl bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
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
              <th className="px-4 py-4 font-semibold text-right">Price</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Comm</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Tax</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">CDC</th>
              <th className="px-2 py-4 font-semibold text-right text-slate-400">Other</th>
              <th className="px-4 py-4 font-semibold text-right">Net Amount</th>
              <th className="px-4 py-4 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredAndSortedTransactions.length === 0 ? (
                <tr>
                    <td colSpan={12} className="px-6 py-10 text-center text-slate-400 italic">
                        {hasActiveFilters ? 'No transactions found matching your filters.' : 'No transactions yet.'}
                    </td>
                </tr>
            ) : (
                filteredAndSortedTransactions.map((tx) => {
                    const isBuy = tx.type === 'BUY';
                    const isDiv = tx.type === 'DIVIDEND';
                    const isTax = tx.type === 'TAX';
                    const isHistory = tx.type === 'HISTORY';
                    const isDeposit = tx.type === 'DEPOSIT';
                    const isWithdrawal = tx.type === 'WITHDRAWAL';

                    let netAmount = 0;
                    const totalAmount = tx.price * tx.quantity;

                    // Net Amount Logic
                    if (isDiv) {
                        netAmount = totalAmount - (tx.tax || 0);
                    } else if (isTax) {
                        netAmount = -totalAmount;
                    } else if (isHistory || isDeposit || isWithdrawal) {
                        netAmount = isWithdrawal ? -Math.abs(totalAmount) : totalAmount;
                    } else {
                        const totalFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
                        netAmount = isBuy ? totalAmount + totalFees : totalAmount - totalFees;
                    }

                    const typeConfig = getTypeConfig(tx);
                    const isNegativeFlow = isTax || isWithdrawal || (isHistory && netAmount < 0);

                    return (
                        <tr key={tx.id} className={`hover:bg-emerald-50/30 transition-colors ${isNegativeFlow ? 'bg-rose-50/30' : ''}`}>
                        <td className="px-4 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{tx.date}</td>
                        <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border ${typeConfig.style}`}>
                                {typeConfig.icon}
                                {typeConfig.label}
                            </span>
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-800">
                            {tx.ticker}
                            {tx.notes && <div className="text-[9px] text-slate-400 font-normal mt-0.5 truncate max-w-[100px]" title={tx.notes}>{tx.notes}</div>}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">{tx.broker || (isTax ? 'System' : '-')}</td>
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
                        <td className="px-2 py-4 text-right text-slate-400 font-mono text-xs">
                            {(tx.otherFees || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-4 text-right font-bold font-mono text-xs ${netAmount < 0 ? 'text-rose-500' : 'text-slate-900'}`}>
                            {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onEdit(tx); }} 
                                    className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-all"
                                    title="Edit"
                                >
                                    <Pencil size={16} />
                                </button>

                                <button onClick={(e) => {e.stopPropagation(); onDelete(tx.id);}} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-all" title="Delete">
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
