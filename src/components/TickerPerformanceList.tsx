import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Coins, Briefcase, ChevronRight } from 'lucide-react';

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  onTickerClick: (ticker: string) => void;
}

type SortKey = 'ticker' | 'status' | 'dividends' | 'fees' | 'totalReturn';
type SortDirection = 'asc' | 'desc';

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors, onTickerClick 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'totalReturn', direction: 'desc' });

  // 1. Aggregate Data Per Ticker
  const tickerStats = useMemo(() => {
      // Get all unique tickers from transaction history
      const uniqueTickers = Array.from(new Set(transactions.map(t => t.ticker)));
      
      return uniqueTickers.map(ticker => {
          const txs = transactions.filter(t => t.ticker === ticker);
          
          let quantity = 0;
          let totalBuyCost = 0;
          let totalSellRevenue = 0;
          let dividends = 0;
          let dividendTax = 0;
          let feesPaid = 0;

          txs.forEach(t => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              const gross = t.quantity * t.price;

              if (t.type === 'BUY') {
                  quantity += t.quantity;
                  totalBuyCost += (gross + fees);
                  feesPaid += fees;
              } else if (t.type === 'SELL') {
                  quantity -= t.quantity;
                  totalSellRevenue += (gross - fees);
                  feesPaid += fees;
              } else if (t.type === 'DIVIDEND') {
                  dividends += gross;
                  dividendTax += (t.tax || 0);
              }
          });

          // Current Value (if held)
          const price = currentPrices[ticker] || 0;
          const currentValue = quantity * price;
          
          // Lifetime Return = (Money Out + Current Value) - Money In
          // Money Out = Sells + Net Dividends
          const netDividends = dividends - dividendTax;
          const totalReturn = (totalSellRevenue + netDividends + currentValue) - totalBuyCost;

          const status = quantity > 0.01 ? 'Active' : 'Closed';

          return {
              ticker,
              sector: sectors[ticker] || 'Unknown',
              status,
              quantity,
              currentValue,
              netDividends,
              feesPaid,
              totalReturn
          };
      });
  }, [transactions, currentPrices, sectors]);

  // 2. Filter & Sort
  const filteredAndSorted = useMemo(() => {
      return tickerStats
          .filter(s => s.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || s.sector.toLowerCase().includes(searchTerm.toLowerCase()))
          .sort((a, b) => {
              const valA = a[sortConfig.key];
              const valB = b[sortConfig.key];
              
              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
  }, [tickerStats, searchTerm, sortConfig]);

  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
      if (sortConfig.key !== col) return <ArrowUpDown size={12} className="text-slate-300 opacity-0 group-hover:opacity-100" />;
      return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />;
  };

  return (
    <div className="mt-8 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 mb-20">
      
      <div className="p-6 border-b border-slate-200/60 flex flex-col md:flex-row justify-between items-center bg-white/40 gap-4">
          <div className="flex items-center gap-3">
              <Briefcase size={20} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800">Stock Directory</h2>
              <span className="text-xs bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">{filteredAndSorted.length} Companies</span>
          </div>
          <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Search Ticker..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
          </div>
      </div>

      <div className="overflow-x-auto">
          <table className="w-full text-left">
              <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                      <th className="px-6 py-4 font-bold cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => handleSort('ticker')}>
                          <div className="flex items-center gap-1">Ticker <SortIcon col="ticker" /></div>
                      </th>
                      <th className="px-6 py-4 font-bold cursor-pointer group hover:bg-slate-100 transition-colors text-center" onClick={() => handleSort('status')}>
                          <div className="flex items-center justify-center gap-1">Status <SortIcon col="status" /></div>
                      </th>
                      <th className="px-6 py-4 font-bold cursor-pointer group hover:bg-slate-100 transition-colors text-right" onClick={() => handleSort('dividends')}>
                          <div className="flex items-center justify-end gap-1">Net Divs <SortIcon col="dividends" /></div>
                      </th>
                      <th className="px-6 py-4 font-bold cursor-pointer group hover:bg-slate-100 transition-colors text-right" onClick={() => handleSort('fees')}>
                          <div className="flex items-center justify-end gap-1">Fees Paid <SortIcon col="fees" /></div>
                      </th>
                      <th className="px-6 py-4 font-bold cursor-pointer group hover:bg-slate-100 transition-colors text-right" onClick={() => handleSort('totalReturn')}>
                          <div className="flex items-center justify-end gap-1">Lifetime Net <SortIcon col="totalReturn" /></div>
                      </th>
                      <th className="px-6 py-4"></th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredAndSorted.map(stock => {
                      const isProfit = stock.totalReturn >= 0;
                      return (
                          <tr 
                              key={stock.ticker} 
                              onClick={() => onTickerClick(stock.ticker)}
                              className="hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                          >
                              <td className="px-6 py-4">
                                  <div className="font-bold text-slate-800 text-base">{stock.ticker}</div>
                                  <div className="text-xs text-slate-500 truncate max-w-[150px]">{stock.sector}</div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${stock.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                      {stock.status}
                                  </span>
                                  {stock.status === 'Active' && <div className="text-[10px] text-slate-400 mt-1">{stock.quantity.toLocaleString()} Shares</div>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  {stock.netDividends > 0 ? (
                                      <div className="flex items-center justify-end gap-1 text-emerald-600 font-medium">
                                          <Coins size={12} /> +{stock.netDividends.toLocaleString(undefined, {maximumFractionDigits:0})}
                                      </div>
                                  ) : <span className="text-slate-300">-</span>}
                              </td>
                              <td className="px-6 py-4 text-right text-rose-400 font-mono text-xs">
                                  {stock.feesPaid > 0 ? `-${stock.feesPaid.toLocaleString(undefined, {maximumFractionDigits:0})}` : '-'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <div className={`font-bold text-base ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {isProfit ? '+' : ''}{stock.totalReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-medium flex items-center justify-end gap-1">
                                      {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                      All Time
                                  </div>
                              </td>
                              <td className="px-6 py-4 text-center text-slate-300 group-hover:text-emerald-500 transition-colors">
                                  <ChevronRight size={20} />
                              </td>
                          </tr>
                      );
                  })}
              </tbody>
          </table>
      </div>
    </div>
  );
};
