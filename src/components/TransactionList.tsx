import React, { useState, useMemo, useEffect } from 'react';
import { Transaction } from '../types';
import { Trash2, ArrowUpRight, History, Search, Filter, X, Pencil, AlertCircle, FileSpreadsheet, FileText, Download, Settings2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ArrowRightLeft } from 'lucide-react';
import { TaxIcon } from './ui/TaxIcon'; 
import { DepositIcon } from './ui/DepositIcon'; 
import { WithdrawIcon } from './ui/WithdrawIcon';
import { BuyIcon } from './ui/BuyIcon';
import { SellIcon } from './ui/SellIcon';
import { DividendIcon } from './ui/DividendIcon';
import { HistoricalPnLIcon } from './ui/HistoricalPnLIcon';
import { FeeIcon } from './ui/FeeIcon'; 
import { exportToExcel, exportToCSV } from '../utils/export';
import { PortfolioType } from '../types';
import { isFundTicker } from '../utils/fundId';
import { fmtFundNav, fmtFundUnits } from '../utils/fundFormat';
import { formatTransactionLabel, formatTransactionSubtext, formatConversionSubtext } from '../utils/fundDisplay';
import { buildFundConversionMap, getFundTradeDisplayType, type FundConversionLeg } from '../utils/fundCash';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onDeleteMultiple?: (ids: string[]) => void;
  onEdit: (tx: Transaction) => void;
  googleSheetId?: string | null;
  displayNames?: Record<string, string>;
  portfolioType?: PortfolioType;
}

type SortKey = keyof Transaction | 'netAmount';
type SortDirection = 'asc' | 'desc';
interface SortConfig { key: SortKey; direction: SortDirection; }

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onDelete,
  onDeleteMultiple,
  onEdit,
  googleSheetId,
  displayNames = {},
  portfolioType = 'PSX',
}) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const colSpan = isFund ? 10 : 13;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const conversionMap = useMemo(
    () => (isFund ? buildFundConversionMap(transactions) : new Map<string, FundConversionLeg>()),
    [isFund, transactions]
  );

  const matchesTypeFilter = (tx: Transaction) => {
    const conv = conversionMap.get(tx.id);
    if (filterType === 'ALL') return true;
    if (filterType === 'CONVERT') return !!conv;
    if (filterType === 'BUY') return tx.type === 'BUY' && !conv;
    if (filterType === 'SELL') return tx.type === 'SELL' && !conv;
    return tx.type === filterType;
  };

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getNetAmount = (tx: Transaction) => {
      let netAmount = 0; const totalAmount = tx.price * tx.quantity;
      if (tx.type === 'DIVIDEND') netAmount = totalAmount - (tx.tax || 0) - (tx.otherFees || 0);
      else if (tx.type === 'TAX') netAmount = -totalAmount;
      else if (tx.type === 'HISTORY' || tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE') netAmount = (tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE') ? -Math.abs(totalAmount) : totalAmount;
      else if (tx.type === 'OTHER') { 
          if (tx.category === 'OTHER_TAX' || tx.category === 'CDC_CHARGE') netAmount = -Math.abs(totalAmount); 
          else netAmount = totalAmount; 
      }
      else { const totalFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0); netAmount = tx.type === 'BUY' ? totalAmount + totalFees : totalAmount - totalFees; }
      return netAmount;
  };

  const filteredAndSortedTransactions = useMemo(() => {
    const filtered = transactions.filter(tx => {
        const searchLower = searchTerm.toLowerCase();
        const label = formatTransactionLabel(tx.ticker, displayNames, tx.notes).toLowerCase();
        const matchesSearch = tx.ticker.toLowerCase().includes(searchLower)
          || label.includes(searchLower)
          || (tx.broker && tx.broker.toLowerCase().includes(searchLower))
          || (tx.notes && tx.notes.toLowerCase().includes(searchLower));
        const matchesFrom = dateFrom ? tx.date >= dateFrom : true;
        const matchesTo = dateTo ? tx.date <= dateTo : true;
        const matchesType = matchesTypeFilter(tx);
        return matchesSearch && matchesFrom && matchesTo && matchesType;
    });
    return filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Transaction], bValue: any = b[sortConfig.key as keyof Transaction];
        if (sortConfig.key === 'netAmount') { aValue = getNetAmount(a); bValue = getNetAmount(b); }
        if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); bValue = bValue.toLowerCase(); }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [transactions, searchTerm, dateFrom, dateTo, filterType, sortConfig, conversionMap, displayNames]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterType, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => { const start = (currentPage - 1) * itemsPerPage; return filteredAndSortedTransactions.slice(start, start + itemsPerPage); }, [filteredAndSortedTransactions, currentPage, itemsPerPage]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.checked) setSelectedIds(new Set(filteredAndSortedTransactions.map(t => t.id))); else setSelectedIds(new Set()); };
  const handleSelectOne = (id: string) => { const newSelected = new Set(selectedIds); if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setSelectedIds(newSelected); };
  const executeBulkDelete = () => { if (onDeleteMultiple && selectedIds.size > 0) { onDeleteMultiple(Array.from(selectedIds)); setSelectedIds(new Set()); } };
  const clearFilters = () => { setSearchTerm(''); setFilterType('ALL'); setDateFrom(''); setDateTo(''); };
  const hasActiveFilters = searchTerm || dateFrom || dateTo || filterType !== 'ALL';

  const getTypeConfig = (tx: Transaction, conv?: FundConversionLeg) => {
      if (conv) {
          return {
              style: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200/60 dark:border-violet-500/20',
              icon: <ArrowRightLeft size={12} />,
              label: conv.leg === 'out' ? 'CONVERT OUT' : 'CONVERT IN',
          };
      }
      switch (tx.type) {
          case 'BUY': return { style: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20', icon: <BuyIcon className="w-3.5 h-3.5" />, label: 'BUY' };
          case 'SELL': return { style: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20', icon: <SellIcon className="w-3.5 h-3.5" />, label: 'SELL' };
          case 'DIVIDEND': return { style: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-500/20', icon: <DividendIcon className="w-3.5 h-3.5" />, label: 'DIVIDEND' };
          case 'TAX': return { style: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20', icon: <TaxIcon className="w-3 h-3" />, label: 'TAX' };
          case 'HISTORY': return { style: tx.price >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20', icon: <HistoricalPnLIcon className="w-3.5 h-3.5" />, label: 'Historical P&L' };
          case 'DEPOSIT': return { style: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-500/20', icon: <DepositIcon className="w-3.5 h-3.5" />, label: 'DEPOSIT' };
          case 'WITHDRAWAL': return { style: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20', icon: <WithdrawIcon className="w-3.5 h-3.5" />, label: 'WITHDRAWAL' };
          case 'REFUND_OF_CAPITAL': return { style: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200/60 dark:border-sky-500/20', icon: <DividendIcon className="w-3.5 h-3.5" />, label: 'CAPITAL REFUND' };
          case 'ANNUAL_FEE': return { style: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20', icon: <FeeIcon className="w-3.5 h-3.5" />, label: 'ANNUAL FEE' };
          case 'OTHER': return { style: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60', icon: <Settings2 size={12} />, label: tx.category === 'OTHER_TAX' ? 'TAX/FEE' : tx.category === 'CDC_CHARGE' ? 'CDC FEE' : 'ADJUST' };
          default: return { style: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60', icon: <ArrowUpRight size={10} />, label: tx.type };
      }
  };

  const getRowSubtext = (tx: Transaction, conv?: FundConversionLeg) => {
    if (conv) return formatConversionSubtext(conv.leg, conv.otherTicker, displayNames);
    return formatTransactionSubtext(tx.ticker, tx.notes, displayNames);
  };

  const handleExport = (type: 'excel' | 'csv') => {
      const data = filteredAndSortedTransactions.map(tx => ({
        Date: tx.date,
        Type: isFund ? getFundTradeDisplayType(tx, conversionMap) : tx.type,
        [isFund ? 'Fund' : 'Ticker']: formatTransactionLabel(tx.ticker, displayNames, tx.notes),
        ...(isFund ? {} : { Broker: tx.broker || 'N/A' }),
        Quantity: tx.quantity,
        Price: tx.price,
        Commission: tx.commission || 0,
        Tax: tx.tax || 0,
        CDC: tx.cdcCharges || 0,
        Other: tx.otherFees || 0,
        'Net Amount': getNetAmount(tx),
        Notes: tx.notes || '',
      }));
      const filename = `Transactions_Export_${new Date().toISOString().split('T')[0]}`;
      if (type === 'excel') exportToExcel(data, filename); else exportToCSV(data, filename);
  };
  const handleExportSelected = () => {
      const selectedTransactions = transactions.filter(t => selectedIds.has(t.id));
      const data = selectedTransactions.map(tx => ({
        Date: tx.date,
        Type: isFund ? getFundTradeDisplayType(tx, conversionMap) : tx.type,
        [isFund ? 'Fund' : 'Ticker']: formatTransactionLabel(tx.ticker, displayNames, tx.notes),
        ...(isFund ? {} : { Broker: tx.broker || 'N/A' }),
        Quantity: tx.quantity,
        Price: tx.price,
        Commission: tx.commission || 0,
        Tax: tx.tax || 0,
        CDC: tx.cdcCharges || 0,
        Other: tx.otherFees || 0,
        'Net Amount': getNetAmount(tx),
        Notes: tx.notes || '',
      }));
      exportToExcel(data, `Selected_Transactions_${new Date().toISOString().split('T')[0]}`); setSelectedIds(new Set());
  };

  const SortIcon = ({ column }: { column: SortKey }) => { if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />; return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />; };
  const Th = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey?: SortKey, align?: 'left'|'right'|'center', className?: string }) => ( <th className={`px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer select-none group hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors ${className}`} onClick={() => sortKey && handleSort(sortKey)}> <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}> {label} {sortKey && <SortIcon column={sortKey} />} </div> </th> );

  return (
    <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden flex flex-col shadow-card dark:shadow-card-dark mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Controls Header */}
      <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex flex-col gap-4 bg-white dark:bg-slate-900">
        <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4">
          <div className="flex items-center gap-3"> 
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-sm border border-emerald-100/60 dark:border-emerald-500/20">
              <History size={20} /> 
            </div>
            <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">Transaction History</h2> 
          </div>
          
          <div className="flex items-center gap-3 overflow-x-auto pb-2 xl:pb-0 w-full xl:w-auto no-scrollbar">
              {googleSheetId && ( <a href={`https://docs.google.com/spreadsheets/d/${googleSheetId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all text-xs font-bold shrink-0 shadow-sm hover:-translate-y-0.5"> <ExternalLink size={14} /> Open Sheet </a> )}
              
              {selectedIds.size > 0 && ( 
                  <div className="flex items-center gap-2.5 animate-in fade-in slide-in-from-right-5 shrink-0"> 
                      <button onClick={handleExportSelected} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-xl border border-indigo-200/60 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all text-xs font-bold shrink-0 shadow-sm hover:-translate-y-0.5"> <Download size={14} /> Export ({selectedIds.size}) </button> 
                      {onDeleteMultiple && ( <button onClick={executeBulkDelete} className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 px-4 py-2.5 rounded-xl border border-rose-200/60 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all text-xs font-bold shrink-0 shadow-sm hover:-translate-y-0.5"> <Trash2 size={14} /> Delete ({selectedIds.size}) </button> )} 
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1"></div> 
                  </div> 
              )}
              
              <div className="flex bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/60 p-1 shadow-sm shrink-0"> 
                  <button onClick={() => handleExport('excel')} className="p-2.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors" title="Export Excel"> <FileSpreadsheet size={16} /> </button> 
                  <div className="w-[1px] bg-slate-200 dark:bg-slate-700 my-1.5 mx-0.5"></div> 
                  <button onClick={() => handleExport('csv')} className="p-2.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors" title="Export CSV"> <FileText size={16} /> </button> 
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shrink-0 shadow-sm tabular-nums"> Total: {transactions.length} </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1"> 
                <Search size={16} className="absolute left-3.5 top-3 text-slate-400" /> 
                <input type="text" placeholder={isFund ? 'Search fund or notes...' : 'Search Ticker, Broker or Notes...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder-slate-400 shadow-sm transition-all" /> 
            </div>
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative w-full sm:w-auto"> 
                    <div className="absolute left-3.5 top-3 text-slate-400 pointer-events-none"><Filter size={16} /></div> 
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full sm:w-[150px] bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none appearance-none cursor-pointer shadow-sm transition-all"> 
                        <option value="ALL">All Types</option> 
                        <option value="BUY">Buy</option> 
                        <option value="SELL">Sell</option> 
                        {isFund && <option value="CONVERT">Convert</option>}
                        <option value="DIVIDEND">Dividend</option> 
                        <option value="TAX">Tax / CGT</option> 
                        <option value="HISTORY">History</option> 
                        <option value="DEPOSIT">Deposit</option> 
                        <option value="WITHDRAWAL">Withdrawal</option> 
                        <option value="ANNUAL_FEE">Annual Fee</option> 
                        <option value="OTHER">Other</option> 
                    </select> 
                </div>
                <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-3 py-1 shadow-sm transition-all shrink-0"> 
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none w-[110px] py-2 dark:color-scheme-dark" /> 
                    <span className="text-slate-300 dark:text-slate-600 text-xs">-</span> 
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none w-[110px] py-2 dark:color-scheme-dark" /> 
                </div>
            </div>
            {hasActiveFilters && ( 
                <button onClick={clearFilters} className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-sm hover:-translate-y-0.5 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"> 
                    <X size={16} /> Clear 
                </button> 
            )}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex-1 px-3 pb-3 space-y-2.5">
        {paginatedTransactions.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-400 dark:text-slate-500 font-medium text-sm">
            {hasActiveFilters ? 'No transactions found matching your filters.' : 'No transactions yet.'}
          </div>
        ) : (
          paginatedTransactions.map((tx) => {
            const netAmount = getNetAmount(tx);
            const conv = conversionMap.get(tx.id);
            const typeConfig = getTypeConfig(tx, conv);
            const isSelected = selectedIds.has(tx.id);
            const txLabel = formatTransactionLabel(tx.ticker, displayNames, tx.notes);
            const txSub = getRowSubtext(tx, conv);
            const isCDCManual = tx.type === 'OTHER' && tx.category === 'CDC_CHARGE';
            const isOtherManual = tx.type === 'OTHER' && tx.category === 'OTHER_TAX';
            const displayPrice = (isCDCManual || isOtherManual) ? 0 : tx.price;
            return (
              <div
                key={`${tx.id}-m`}
                className={`rounded-2xl border p-3.5 ${isSelected ? 'border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-500/10' : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/25'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(tx.id)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="font-display font-black text-slate-900 dark:text-white truncate">{txLabel}</div>
                        {txSub && <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{txSub}</div>}
                      </div>
                      <div className={`font-mono font-bold tabular-nums text-sm shrink-0 ${netAmount < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                        {netAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${typeConfig.style}`}>
                        {typeConfig.icon} {typeConfig.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 tabular-nums">{tx.date}</span>
                      {!isFund && tx.broker && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tx.broker}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        {isFundTicker(tx.ticker) ? fmtFundUnits(tx.quantity) : tx.quantity.toLocaleString()}
                        {displayPrice !== 0 && (
                          <> · {isFundTicker(tx.ticker) && !['DEPOSIT', 'HISTORY', 'WITHDRAWAL', 'ANNUAL_FEE'].includes(tx.type)
                            ? fmtFundNav(displayPrice)
                            : displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(tx)}
                          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 p-2 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(tx.id)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 p-2 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm min-w-[1000px] whitespace-nowrap border-collapse">
          <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-left sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800"> 
            <tr> 
                <th className="px-4 py-3.5 w-12 text-center"> <input type="checkbox" onChange={handleSelectAll} checked={filteredAndSortedTransactions.length > 0 && selectedIds.size === filteredAndSortedTransactions.length} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"/> </th> 
                <Th label="Date" sortKey="date" /> 
                <Th label="Type" sortKey="type" /> 
                <Th label={isFund ? 'Fund' : 'Ticker'} sortKey="ticker" /> 
                {!isFund && <Th label="Broker" sortKey="broker" />} 
                <Th label={isFund ? 'Units' : 'Qty'} sortKey="quantity" align="right" /> 
                <Th label={isFund ? 'NAV' : 'Price'} sortKey="price" align="right" /> 
                {!isFund && <Th label="Comm" sortKey="commission" align="right" className="opacity-80" />} 
                <Th label="Tax" sortKey="tax" align="right" className="opacity-80" /> 
                {!isFund && <Th label="CDC" sortKey="cdcCharges" align="right" className="opacity-80" />} 
                <Th label={isFund ? 'Load/Fees' : 'Other/Zakat'} sortKey="otherFees" align="right" className="opacity-80" /> 
                <Th label="Net Amount" sortKey="netAmount" align="right" /> 
                <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-center">Action</th> 
            </tr> 
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {paginatedTransactions.length === 0 ? ( <tr> <td colSpan={colSpan} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"> {hasActiveFilters ? 'No transactions found matching your filters.' : 'No transactions yet.'} </td> </tr> ) : (
                paginatedTransactions.map((tx) => {
                    const isDiv = tx.type === 'DIVIDEND'; const netAmount = getNetAmount(tx);
                    const conv = conversionMap.get(tx.id);
                    const typeConfig = getTypeConfig(tx, conv);
                    const isNegativeFlow = ['TAX', 'WITHDRAWAL', 'ANNUAL_FEE'].includes(tx.type) || (tx.type === 'OTHER' && (tx.category === 'OTHER_TAX' || tx.category === 'CDC_CHARGE')) || (tx.type === 'OTHER' && tx.price < 0) || (tx.type === 'HISTORY' && netAmount < 0); const isSelected = selectedIds.has(tx.id);
                    const txLabel = formatTransactionLabel(tx.ticker, displayNames, tx.notes);
                    const txSub = getRowSubtext(tx, conv);
                    
                    const isCDCManual = tx.type === 'OTHER' && tx.category === 'CDC_CHARGE';
                    const isOtherManual = tx.type === 'OTHER' && tx.category === 'OTHER_TAX';
                    
                    const displayPrice = (isCDCManual || isOtherManual) ? 0 : tx.price;
                    const displayCDC = isCDCManual ? tx.price : (tx.cdcCharges || 0);
                    const displayOther = isOtherManual ? tx.price : (tx.otherFees || 0);

                    return (
                        <tr key={tx.id} className={`even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group ${isNegativeFlow ? 'bg-rose-50/30 dark:bg-rose-500/5' : ''} ${isSelected ? 'bg-indigo-50/80 dark:bg-indigo-500/10' : ''}`}>
                        <td className="px-4 py-3 text-center"> <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(tx.id)} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"/> </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-mono font-medium tabular-nums">{tx.date}</td>
                        <td className="px-4 py-3"> <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shadow-sm ${typeConfig.style}`}> {typeConfig.icon} {typeConfig.label} </span> </td>
                        <td className="px-4 py-3 font-display font-black text-slate-900 dark:text-white max-w-[220px]">
                          <div className="truncate" title={txLabel}>{txLabel}</div>
                          {txSub && <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate" title={txSub}>{txSub}</div>}
                        </td>
                        {!isFund && <td className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">{tx.broker || (tx.type === 'TAX' ? 'System' : '-')}</td>}
                        <td className="px-4 py-3 text-right text-slate-900 dark:text-slate-100 font-bold tabular-nums"> {isFundTicker(tx.ticker) ? fmtFundUnits(tx.quantity) : tx.quantity.toLocaleString()} {isDiv && <div className="hidden group-hover:block absolute bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-20">Check History</div>} </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs tabular-nums"> {displayPrice !== 0 ? (isFundTicker(tx.ticker) && !['DEPOSIT', 'HISTORY', 'WITHDRAWAL', 'ANNUAL_FEE', 'CASH'].includes(tx.ticker) && !['DEPOSIT', 'HISTORY', 'WITHDRAWAL', 'ANNUAL_FEE'].includes(tx.type) ? fmtFundNav(displayPrice) : displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '-'} </td>
                        {!isFund && <td className="px-2 py-3 text-right text-slate-400 dark:text-slate-500 font-mono text-[10px] tabular-nums"> {(tx.commission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </td>}
                        <td className="px-2 py-3 text-right text-slate-400 dark:text-slate-500 font-mono text-[10px] tabular-nums"> {(tx.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </td>
                        {!isFund && <td className={`px-2 py-3 text-right font-mono text-[10px] tabular-nums ${isCDCManual ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-400 dark:text-slate-500'}`}> {displayCDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </td>}
                        <td className={`px-2 py-3 text-right font-mono text-[10px] tabular-nums ${isOtherManual ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-400 dark:text-slate-500'}`}> {displayOther.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono text-sm tabular-nums ${netAmount < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}> {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} </td>
                        <td className="px-4 py-3 text-center"> 
                            <div className="flex items-center justify-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"> 
                                <button onClick={(e) => { e.stopPropagation(); onEdit(tx); }} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 p-2 rounded-xl transition-all shadow-sm" title="Edit"> <Pencil size={16} /> </button> 
                                <button onClick={(e) => {e.stopPropagation(); onDelete(tx.id);}} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 p-2 rounded-xl transition-all shadow-sm" title="Delete"> <Trash2 size={16} /> </button> 
                            </div> 
                        </td>
                        </tr>
                    );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-5 border-t border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3"> 
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Rows:</span> 
              <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-lg text-xs py-1.5 px-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-slate-700 dark:text-slate-300 font-bold cursor-pointer transition-colors shadow-sm"> 
                  <option value={25}>25</option> 
                  <option value={50}>50</option> 
                  <option value={100}>100</option> 
              </select> 
          </div>
          <div className="flex items-center gap-5"> 
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums"> 
                  {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAndSortedTransactions.length)} of {filteredAndSortedTransactions.length} 
              </span> 
              <div className="flex gap-1.5"> 
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300"> 
                      <ChevronLeft size={16} /> 
                  </button> 
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300"> 
                      <ChevronRight size={16} /> 
                  </button> 
              </div> 
          </div>
      </div>
    </div>
  );
};
