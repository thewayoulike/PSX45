import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction } from '../types';
import { 
  Search, 
  ChevronDown, 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  Wallet, 
  Receipt, 
  PieChart, 
  ArrowRight,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Card } from './ui/Card';

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  onTickerClick: (ticker: string) => void;
}

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Calculate Stats for ALL tickers first
  const allTickerStats = useMemo(() => {
      // Exclude system types to get only real stocks
      const SYSTEM_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE', 'TAX', 'HISTORY', 'OTHER'];
      const SYSTEM_TICKERS = ['CASH', 'ANNUAL FEE', 'CGT', 'PREV-PNL', 'ADJUSTMENT', 'OTHER FEE'];

      const uniqueTickers = Array.from(new Set(
          transactions
            .filter(t => !SYSTEM_TYPES.includes(t.type))
            .map(t => t.ticker)
            .filter(t => !SYSTEM_TICKERS.includes(t))
      ));
      
      return uniqueTickers.map(ticker => {
          const txs = transactions.filter(t => t.ticker === ticker);
          
          let quantity = 0;
          let totalBuyCost = 0;
          let totalSellRevenue = 0;
          let dividends = 0;
          let dividendTax = 0;
          let feesPaid = 0; // Comm + Tax + CDC + Other
          let buyCount = 0;
          let sellCount = 0;

          txs.forEach(t => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              const gross = t.quantity * t.price;

              if (t.type === 'BUY') {
                  quantity += t.quantity;
                  totalBuyCost += (gross + fees);
                  feesPaid += fees;
                  buyCount++;
              } else if (t.type === 'SELL') {
                  quantity -= t.quantity;
                  totalSellRevenue += (gross - fees);
                  feesPaid += fees;
                  sellCount++;
              } else if (t.type === 'DIVIDEND') {
                  dividends += gross;
                  dividendTax += (t.tax || 0);
              }
          });

          // Current Value (if held)
          const price = currentPrices[ticker] || 0;
          const currentValue = quantity * price;
          
          // Cost Basis of Remaining Shares (Weighted Avg logic simplified for aggregate)
          // Total Spent - (Revenue from Sells) is roughly remaining cash committed, 
          // but for P&L we want: (Unrealized + Realized + Divs)
          
          const netDividends = dividends - dividendTax;
          const totalNetReturn = (totalSellRevenue + netDividends + currentValue) - totalBuyCost;

          // Avg Buy Price Calculation
          const totalQtyBought = txs.filter(t => t.type === 'BUY').reduce((acc, t) => acc + t.quantity, 0);
          const avgBuyPrice = totalQtyBought > 0 ? (totalBuyCost / totalQtyBought) : 0; // Note: includes fees

          return {
              ticker,
              sector: sectors[ticker] || 'Unknown',
              status: quantity > 0.01 ? 'Active' : 'Closed',
              quantity,
              currentPrice: price,
              currentValue,
              avgBuyPrice,
              netDividends,
              feesPaid,
              totalReturn: totalNetReturn,
              tradeCount: buyCount + sellCount
          };
      }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [transactions, currentPrices, sectors]);

  // 2. Filter for Dropdown
  const filteredOptions = useMemo(() => {
      if (!searchTerm) return allTickerStats;
      return allTickerStats.filter(s => 
          s.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
          s.sector.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [allTickerStats, searchTerm]);

  // 3. Get Selected Data
  const selectedStats = useMemo(() => {
      if (!selectedTicker) return null;
      return allTickerStats.find(s => s.ticker === selectedTicker);
  }, [selectedTicker, allTickerStats]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (ticker: string) => {
      setSelectedTicker(ticker);
      setSearchTerm(ticker);
      setIsDropdownOpen(false);
  };

  const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="max-w-5xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* --- SEARCH / SELECT HEADER --- */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 mb-8 flex flex-col items-center justify-center text-center">
          <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Stock Performance</h2>
              <p className="text-slate-500 text-sm">Select a company to view detailed holding analysis, returns, and income.</p>
          </div>

          <div className="relative w-full max-w-md" ref={dropdownRef}>
              <div 
                  className="flex items-center bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all cursor-text"
                  onClick={() => setIsDropdownOpen(true)}
              >
                  <Search size={20} className="text-slate-400 mr-3" />
                  <input 
                      type="text" 
                      className="flex-1 bg-transparent outline-none text-slate-800 font-bold placeholder:font-normal"
                      placeholder="Search Ticker (e.g. OGDC)..."
                      value={searchTerm}
                      onChange={(e) => {
                          setSearchTerm(e.target.value.toUpperCase());
                          setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                  />
                  {selectedTicker && (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); setSearchTerm(''); }} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-500 mr-1">
                          <XCircle size={16} />
                      </button>
                  )}
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {/* DROPDOWN MENU */}
              {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                      {filteredOptions.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm">No stocks found.</div>
                      ) : (
                          filteredOptions.map(stats => (
                              <div 
                                  key={stats.ticker}
                                  onClick={() => handleSelect(stats.ticker)}
                                  className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer group transition-colors"
                              >
                                  <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black ${stats.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                          {stats.ticker.substring(0, 2)}
                                      </div>
                                      <div className="text-left">
                                          <div className="font-bold text-slate-800">{stats.ticker}</div>
                                          <div className="text-[10px] text-slate-400 uppercase font-medium">{stats.sector}</div>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                       <div className={`font-bold text-sm ${stats.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                           {stats.totalReturn >= 0 ? '+' : ''}{formatCurrency(stats.totalReturn)}
                                       </div>
                                       <div className="text-[10px] text-slate-400">{stats.status}</div>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              )}
          </div>
      </div>

      {/* --- DETAIL VIEW --- */}
      {selectedStats ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              
              {/* 1. Header Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-inner ${selectedStats.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {selectedStats.ticker.substring(0, 1)}
                      </div>
                      <div>
                          <h1 className="text-3xl font-black text-slate-800 tracking-tight">{selectedStats.ticker}</h1>
                          <div className="flex items-center gap-2 mt-1">
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold uppercase border border-slate-200">{selectedStats.sector}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${selectedStats.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                  {selectedStats.status}
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full md:w-auto justify-between md:justify-end">
                      {selectedStats.status === 'Active' && (
                          <div className="text-right">
                              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Current Price</div>
                              <div className="text-xl font-bold text-slate-800">Rs. {selectedStats.currentPrice.toLocaleString()}</div>
                          </div>
                      )}
                      <div className="text-right">
                          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lifetime Net</div>
                          <div className={`text-2xl font-black ${selectedStats.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {selectedStats.totalReturn >= 0 ? '+' : ''}{formatCurrency(selectedStats.totalReturn)}
                          </div>
                      </div>
                  </div>
              </div>

              {/* 2. Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Position Card */}
                  <Card className="md:col-span-1">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Wallet size={18} /></div>
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Position</h3>
                      </div>
                      {selectedStats.quantity > 0.01 ? (
                          <div className="space-y-4">
                              <div>
                                  <div className="text-3xl font-bold text-slate-800">{selectedStats.quantity.toLocaleString()}</div>
                                  <div className="text-xs text-slate-400 font-bold uppercase">Shares Owned</div>
                              </div>
                              <div className="h-px bg-slate-100 w-full"></div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <div className="text-sm font-bold text-slate-700">Rs. {formatCurrency(selectedStats.currentValue)}</div>
                                      <div className="text-[10px] text-slate-400">Market Value</div>
                                  </div>
                                  <div>
                                      <div className="text-sm font-bold text-slate-700">Rs. {formatCurrency(selectedStats.avgBuyPrice)}</div>
                                      <div className="text-[10px] text-slate-400">Avg Cost (Est)</div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                              <CheckCircle2 size={40} className="mb-2 opacity-50" />
                              <span className="text-sm font-bold">Position Closed</span>
                              <span className="text-xs">No active shares</span>
                          </div>
                      )}
                  </Card>

                  {/* Income Card */}
                  <Card className="md:col-span-1">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Coins size={18} /></div>
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Passive Income</h3>
                      </div>
                      <div className="space-y-4">
                           <div>
                               <div className="text-3xl font-bold text-indigo-600">+{formatCurrency(selectedStats.netDividends)}</div>
                               <div className="text-xs text-slate-400 font-bold uppercase">Net Dividends</div>
                           </div>
                           
                           {/* Decorative chart representation */}
                           <div className="flex gap-1 h-12 items-end mt-2">
                               {[40, 60, 30, 80, 50, 90, 70].map((h, i) => (
                                   <div key={i} className="flex-1 bg-indigo-100 rounded-t-sm hover:bg-indigo-200 transition-colors" style={{ height: `${h}%` }}></div>
                               ))}
                           </div>
                      </div>
                  </Card>

                   {/* Costs Card */}
                   <Card className="md:col-span-1">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Receipt size={18} /></div>
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Costs & Fees</h3>
                      </div>
                      <div className="space-y-4">
                           <div>
                               <div className="text-3xl font-bold text-rose-500">-{formatCurrency(selectedStats.feesPaid)}</div>
                               <div className="text-xs text-slate-400 font-bold uppercase">Commission & Taxes</div>
                           </div>
                           
                           <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                               <div className="flex justify-between items-center text-xs mb-1">
                                   <span className="text-slate-500">Trades Executed</span>
                                   <span className="font-bold text-slate-800">{selectedStats.tradeCount}</span>
                               </div>
                               <div className="w-full bg-slate-200 rounded-full h-1.5">
                                   <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                               </div>
                           </div>
                      </div>
                  </Card>
              </div>

              {/* 3. Transaction Summary List (Mini) */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                   <div className="p-6 border-b border-slate-100 flex items-center gap-2">
                       <Briefcase size={20} className="text-slate-400" />
                       <h3 className="font-bold text-slate-800">Recent Activity for {selectedStats.ticker}</h3>
                   </div>
                   <div className="overflow-x-auto">
                       <table className="w-full text-left text-sm">
                           <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                               <tr>
                                   <th className="px-6 py-4">Date</th>
                                   <th className="px-6 py-4">Type</th>
                                   <th className="px-6 py-4 text-right">Qty</th>
                                   <th className="px-6 py-4 text-right">Price</th>
                                   <th className="px-6 py-4 text-right">Total Net</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                               {transactions
                                   .filter(t => t.ticker === selectedStats.ticker)
                                   .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                   .slice(0, 5) // Show top 5 only
                                   .map(t => {
                                      const total = t.quantity * t.price;
                                      const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
                                      let net = 0;
                                      if (t.type === 'BUY') net = -(total + fees);
                                      else if (t.type === 'SELL') net = total - fees;
                                      else if (t.type === 'DIVIDEND') net = total - (t.tax || 0);
                                      
                                      return (
                                          <tr key={t.id} className="hover:bg-slate-50/50">
                                              <td className="px-6 py-4 text-slate-500 font-mono text-xs">{t.date}</td>
                                              <td className="px-6 py-4">
                                                  <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                                                      t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                      t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                      t.type === 'DIVIDEND' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100'
                                                  }`}>{t.type}</span>
                                              </td>
                                              <td className="px-6 py-4 text-right text-slate-700">{t.quantity.toLocaleString()}</td>
                                              <td className="px-6 py-4 text-right text-slate-500 font-mono">{t.price.toLocaleString()}</td>
                                              <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                  {formatCurrency(net)}
                                              </td>
                                          </tr>
                                      );
                                   })
                               }
                           </tbody>
                       </table>
                       <div className="p-4 bg-slate-50 text-center text-xs text-slate-400 font-medium">
                           Showing recent 5 transactions
                       </div>
                   </div>
              </div>

          </div>
      ) : (
          /* --- EMPTY STATE / PLACEHOLDER --- */
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                  <PieChart size={48} />
              </div>
              <h3 className="text-xl font-bold text-slate-400">No Stock Selected</h3>
              <p className="text-slate-400">Use the search bar above to analyze a specific stock.</p>
          </div>
      )}
    </div>
  );
};
