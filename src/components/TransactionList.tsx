import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { Trash2, ArrowUpRight, History, Search, Filter, X, Pencil, AlertCircle, FileSpreadsheet, FileText, Download, Settings2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { TaxIcon } from './ui/TaxIcon'; 
import { DepositIcon } from './ui/DepositIcon'; 
import { WithdrawIcon } from './ui/WithdrawIcon';
import { BuyIcon } from './ui/BuyIcon';
import { SellIcon } from './ui/SellIcon';
import { DividendIcon } from './ui/DividendIcon';
import { HistoricalPnLIcon } from './ui/HistoricalPnLIcon';
import { FeeIcon } from './ui/FeeIcon'; 
import { exportToExcel, exportToCSV } from '../utils/export';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onDeleteMultiple?: (ids: string[]) => void;
  onEdit: (tx: Transaction) => void;
  googleSheetId?: string | null;
}

type SortKey = keyof Transaction | 'netAmount';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onDelete, onDeleteMultiple, onEdit, googleSheetId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getNetAmount = (tx: Transaction) => {
      let netAmount = 0;
      const totalAmount = tx.price * tx.quantity;
      if (tx.type === 'DIVIDEND') netAmount = totalAmount - (tx.tax || 0);
      else if (tx.type === 'TAX') netAmount = -totalAmount;
      else if (tx.type === 'HISTORY' || tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE') netAmount = (tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE') ? -Math.abs(totalAmount) : totalAmount;
      else if (tx.type === 'OTHER') {
          if (tx.category === 'OTHER_TAX') netAmount = -Math.abs(totalAmount);
          else netAmount = totalAmount; 
      }
      else {
          const totalFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
          netAmount = tx.type === 'BUY' ? totalAmount + totalFees : totalAmount - totalFees;
      }
      return netAmount;
  };

  const filteredAndSortedTransactions = useMemo(() => {
    // 1. Filter
    const filtered = transactions.filter(tx => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          tx.ticker.toLowerCase().includes(searchLower) || 
          (tx.broker && tx.broker.toLowerCase().includes(searchLower)) ||
          (tx.notes && tx.notes.toLowerCase().includes(searchLower));

        const matchesFrom = dateFrom ? tx.date >= dateFrom : true;
        const matchesTo = dateTo ? tx.date <= dateTo : true;

        const matchesType = filterType === 'ALL' || tx.type === filterType;

        return matchesSearch && matchesFrom && matchesTo && matchesType;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Transaction];
        let bValue: any = b[sortConfig.key as keyof Transaction];

        if (sortConfig.key === 'netAmount') {
            aValue = getNetAmount(a);
            bValue = getNetAmount(b);
        }

        // Handle strings (case-insensitive)
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [transactions, searchTerm, dateFrom, dateTo, filterType, sortConfig]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          const allIds = new Set(filteredAndSortedTransactions.map(t => t.id));
          setSelectedIds(allIds);
      } else {
          setSelectedIds(new Set());
      }
  };

  const handleSelectOne = (id: string) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      setSelectedIds(newSelected);
  };

  const executeBulkDelete = () => {
      if (onDeleteMultiple && selectedIds.size > 0) {
          onDeleteMultiple(Array.from(selectedIds));
          setSelectedIds(new Set()); 
      }
  };

  const getExpectedDividendQty = (divTx: Transaction): number => {
      const relevantTx = transactions.filter(t => 
          t.ticker === divTx.ticker && 
          t.date <= divTx.date && 
          t.id !== divTx.id &&
          (t.type === 'BUY' || t.type === 'SELL') &&
          (t.broker === divTx.broker)
      );
      
      let qty = 0;
      relevantTx.forEach(t => {
          if (t.type === 'BUY') qty += t.quantity;
          if (t.type === 'SELL') qty -= t.quantity;
      });
      
      return Math.max(0, qty);
  };

  const clearFilters = () => {
    setSearchTerm(''); setFilterType('ALL'); setDateFrom(''); setDateTo('');
  };

  const hasActiveFilters = searchTerm || dateFrom || dateTo || filterType !== 'ALL';

  const prepareExportData = (txList: Transaction[]) => {
      return txList.map(tx => {
          return {
              Date: tx.date,
              Type: tx.type,
              Category: tx.category || '',
              Ticker: tx.ticker,
              Broker: tx.broker || 'N/A',
              Quantity: tx.quantity,
              Price: tx.price,
              Commission: tx.commission || 0,
              Tax: tx.tax || 0,
              CDC: tx.cdcCharges || 0,
              Other: tx.otherFees || 0,
              'Net Amount': getNetAmount(tx),
              Notes: tx.notes || ''
          };
      });
  };

  const handleExport = (type: 'excel' | 'csv') => {
      const data = prepareExportData(filteredAndSortedTransactions);
      const filename = `Transactions_Export_${new Date().toISOString().split('T')[0]}`;
      if (type === 'excel') exportToExcel(data, filename);
      else exportToCSV(data, filename);
  };

  const handleExportSelected = () => {
      const selectedTransactions = transactions.filter(t => selectedIds.has(t.id));
      const data = prepareExportData(selectedTransactions);
      const filename = `Selected_Transactions_${new Date().toISOString().split('T')[0]}`;
      exportToExcel(data, filename);
      setSelectedIds(new Set()); 
  };

  const getTypeConfig = (tx: Transaction) => {
      switch (tx.type) {
          case 'BUY': return { style: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: <BuyIcon className="w-4 h-4" />, label: 'BUY' };
          case 'SELL': return { style: 'bg-rose-50 text-rose-600 border-rose-100', icon: <SellIcon className="w-4 h-4" />, label: 'SELL' };
          case 'DIVIDEND': return { style: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-extrabold', icon: <DividendIcon className="w-4 h-4" />, label: 'DIVIDEND' };
          case 'TAX': return { style: 'bg-rose-50 text-rose-600 border-rose-100', icon: <TaxIcon className="w-3 h-3" />, label: 'TAX' };
          case 'HISTORY': const isPositive = tx.price >= 0; return { style: isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100', icon: <HistoricalPnLIcon className="w-4 h-4" />, label: 'Historical P&L' };
          case 'DEPOSIT': return { style: 'bg-blue-50 text-blue-600 border-blue-100', icon: <DepositIcon className="w-4 h-4" />, label: 'DEPOSIT' };
          case 'WITHDRAWAL': return { style: 'bg-rose-50 text-rose-600 border-rose-100', icon: <WithdrawIcon className="w-4 h-4" />, label: 'WITHDRAWAL' };
          case 'ANNUAL_FEE': return { style: 'bg-amber-50 text-amber-600 border-amber-100', icon: <FeeIcon className="w-4 h-4" />, label: 'ANNUAL FEE' };
          case 'OTHER': return { 
              style: 'bg-slate-50 text-slate-600 border-slate-200', 
              icon: <Settings2 size={12} />, 
              label: tx.category === 'OTHER_TAX' ? 'TAX/FEE' : 'ADJUST' 
          };
          default: return { style: 'bg-slate-50 text-slate-600 border-slate-200', icon: <ArrowUpRight size={10} />, label: tx.type };
      }
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

  if (transactions.length === 0) return null;

  return (
    <div className="mt-10 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 mb-20">
      
      {/* HEADER SECTION - SAME AS BEFORE */}
      <div className="p-6 border-b border-slate-200/60 bg-white/40 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
              <History size={20} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Transaction History</h2>
          </div>
          <div className="flex items-center gap-3">
              {googleSheetId && (
                  <a 
                      href={`https://docs.google.com/spreadsheets/d/${googleSheetId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors text-xs font-bold"
                      title="Open Google Sheet"
                  >
                      <ExternalLink size={14} />
                      Open Sheet
                  </a>
              )}

              {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-5">
                      <button onClick={handleExportSelected} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors text-xs font-bold">
                          <Download size={14} /> Export ({selectedIds.size})
                      </button>
                      
                      {onDeleteMultiple && (
                          <button onClick={executeBulkDelete} className="flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-100 transition-colors text-xs font-bold">
                              <Trash2 size={14} /> Delete ({selectedIds.size})
                          </button>
                      )}
                      <div className="h-5 w-[1px] bg-slate-300 mx-1"></div>
                  </div>
              )}

              <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                  <button onClick={() => handleExport('excel')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"> <FileSpreadsheet size={16} /> </button>
                  <div className="w-[1px] bg-slate-100 my-1 mx-0.5"></div>
                  <button onClick={() => handleExport('csv')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"> <FileText size={16} /> </button>
              </div>
              <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                {filteredAndSortedTransactions.length} / {transactions.length} Entries
              </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input type="text" placeholder="Search Ticker, Broker or Notes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 outline-none placeholder-slate-400" />
            </div>

            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative w-full sm:w-auto">
                    <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none"><Filter size={16} /></div>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full sm:w-[130px] bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 outline-none appearance-none cursor-pointer hover:border-emerald-300 transition-colors">
                        <option value="ALL">All Types</option>
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                        <option value="DIVIDEND">Dividend</option>
                        <option value="TAX">Tax / CGT</option>
                        <option value="HISTORY">History</option>
                        <option value="DEPOSIT">Deposit</option>
                        <option value="WITHDRAWAL">Withdrawal</option>
                        <option value="ANNUAL_FEE">Annual Fee</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>

                <div className="flex gap-2 items-center bg-white border border-slate-200 rounded-xl px-2 py-0.5">
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none w-[110px] py-2" />
                    <span className="text-slate-300 text-xs">to</span>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none w-[110px] py-2" />
                </div>
            </div>

            {hasActiveFilters && (
                <button onClick={clearFilters} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                    <X size={16} /> Clear
                </button>
            )}
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">
              <th className="px-4 py-4 w-10 text-center">
                  <input type="checkbox" onChange={handleSelectAll} checked={filteredAndSortedTransactions.length > 0 && selectedIds.size === filteredAndSortedTransactions.length} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"/>
              </th>
              <Th label="Date" sortKey="date" />
              <Th label="Type" sortKey="type" />
              <Th label="Ticker" sortKey="ticker" />
              <Th label="Broker" sortKey="broker" />
              <Th label="Qty" sortKey="quantity" align="right" />
              <Th label="Price" sortKey="price" align="right" />
              <Th label="Comm" sortKey="commission" align="right" className="text-slate-400" />
              <Th label="Tax" sortKey="tax" align="right" className="text-slate-400" />
              <Th label="CDC" sortKey="cdcCharges" align="right" className="text-slate-400" />
              <Th label="Other" sortKey="otherFees" align="right" className="text-slate-400" />
              <Th label="Net Amount" sortKey="netAmount" align="right" />
              <th className="px-4 py-4 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredAndSortedTransactions.length === 0 ? (
                <tr>
                    <td colSpan={13} className="px-6 py-10 text-center text-slate-400 italic">
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
                    const isFee = tx.type === 'ANNUAL_FEE';
                    const isOtherTax = tx.type === 'OTHER' && tx.category === 'OTHER_TAX';
                    const isNegAdjust = tx.type === 'OTHER' && tx.price < 0;

                    const netAmount = getNetAmount(tx);
                    const typeConfig = getTypeConfig(tx);
                    const isNegativeFlow = isTax || isWithdrawal || isFee || isOtherTax || isNegAdjust || (isHistory && netAmount < 0);

                    let qtyMismatch = false;
                    let expectedQty = 0;
                    if (isDiv) {
                        expectedQty = getExpectedDividendQty(tx);
                        qtyMismatch = expectedQty !== tx.quantity;
                    }

                    const isSelected = selectedIds.has(tx.id);

                    return (
                        <tr key={tx.id} className={`hover:bg-emerald-50/30 transition-colors ${isNegativeFlow ? 'bg-rose-50/30' : ''} ${isSelected ? 'bg-indigo-50/60' : ''}`}>
                        <td className="px-4 py-4 text-center">
                            <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(tx.id)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"/>
                        </td>
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
                        <td className="px-4 py-4 text-right text-slate-700 relative">
                            <div className="flex items-center justify-end gap-2">
                                <span>{tx.quantity.toLocaleString()}</span>
                                {isDiv && qtyMismatch && (
                                    <div className="group relative">
                                        <AlertCircle size={14} className="text-amber-500 cursor-help" />
                                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-50">
                                            Warning: Historical holdings on this date were {expectedQty}, but you recorded dividend for {tx.quantity}.
                                            <div className="absolute right-1 bottom-[-4px] w-2 h-2 bg-slate-800 rotate-45"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </td>
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
                                <button onClick={(e) => { e.stopPropagation(); onEdit(tx); }} className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-all" title="Edit">
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
