import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction } from '../types';
import { 
  Search, 
  ChevronDown, 
  Wallet, 
  Coins, 
  Receipt, 
  History, 
  XCircle,
  BarChart3
} from 'lucide-react';
import { Card } from './ui/Card';

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  onTickerClick: (ticker: string) => void;
}

// Helper interface for the enriched table rows
interface ActivityRow extends Transaction {
  effectiveRate: number;
  costBasisPerShare?: number; // For Sells: What was the buy avg?
  realizedPnL?: number;       // For Sells: Net Sell - Cost Basis
}

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Calculate Comprehensive Stats per Ticker
  const allTickerStats = useMemo(() => {
      const SYSTEM_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE', 'TAX', 'HISTORY', 'OTHER'];
      const SYSTEM_TICKERS = ['CASH', 'ANNUAL FEE', 'CGT', 'PREV-PNL', 'ADJUSTMENT', 'OTHER FEE'];

      const uniqueTickers = Array.from(new Set(
          transactions
            .filter(t => !SYSTEM_TYPES.includes(t.type))
            .map(t => t.ticker)
            .filter(t => !SYSTEM_TICKERS.includes(t))
      ));
      
      return uniqueTickers.map(ticker => {
          const txs = transactions
              .filter(t => t.ticker === ticker)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          let ownedQty = 0;
          let soldQty = 0;
          let totalCostBasis = 0; 
          let realizedPL = 0;     
          
          let totalDividends = 0;
          let dividendTax = 0;
          let feesPaid = 0;       
          
          let tradeCount = 0;

          txs.forEach(t => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              
              if (t.type === 'BUY') {
                  const grossBuy = t.quantity * t.price;
                  const buyCost = grossBuy + fees; 
                  
                  totalCostBasis += buyCost;
                  ownedQty += t.quantity;
                  feesPaid += fees;
                  tradeCount++;
              } 
              else if (t.type === 'SELL') {
                  const grossSell = t.quantity * t.price;
                  const netSell = grossSell - fees;
                  
                  const avgCostPerShare = ownedQty > 0 ? totalCostBasis / ownedQty : 0;
                  const costOfSoldShares = t.quantity * avgCostPerShare;
                  
                  const tradeProfit = netSell - costOfSoldShares;
                  realizedPL += tradeProfit;

                  totalCostBasis -= costOfSoldShares;
                  ownedQty -= t.quantity;
                  soldQty += t.quantity;
                  feesPaid += fees;
                  tradeCount++;
              } 
              else if (t.type === 'DIVIDEND') {
                  const grossDiv = t.quantity * t.price;
                  totalDividends += grossDiv;
                  dividendTax += (t.tax || 0);
              }
          });

          if (ownedQty < 0.001) { ownedQty = 0; totalCostBasis = 0; }

          const currentPrice = currentPrices[ticker] || 0;
          const currentValue = ownedQty * currentPrice;
          const unrealizedPL = currentValue - totalCostBasis;
          const currentAvgPrice = ownedQty > 0 ? totalCostBasis / ownedQty : 0;
          const totalNetReturn = realizedPL + unrealizedPL + (totalDividends - dividendTax);

          return {
              ticker,
              sector: sectors[ticker] || 'Unknown',
              status: ownedQty > 0.01 ? 'Active' : 'Closed',
              ownedQty,
              soldQty,
              currentPrice,
              currentAvgPrice,
              currentValue,
              realizedPL,
              unrealizedPL,
              totalNetReturn,
              totalDividends,
              dividendTax,
              netDividends: totalDividends - dividendTax,
              feesPaid,
              tradeCount
          };
      }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [transactions, currentPrices, sectors]);

  // 2. Generate Detailed Activity Rows (With Historical Context)
  const activityRows = useMemo(() => {
      if (!selectedTicker) return [];

      // Sort chronologically first to build history
      const sortedTxs = transactions
          .filter(t => t.ticker === selectedTicker)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningQty = 0;
      let runningCost = 0; // Total cost of currently held shares

      const rows: ActivityRow[] = sortedTxs.map(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const totalVal = t.quantity * t.price;
          
          let effectiveRate = 0;
          let costBasisPerShare = undefined;
          let realizedPnL = undefined;

          if (t.type === 'BUY') {
              // Effective Rate = (Price + Fees per share)
              effectiveRate = (totalVal + fees) / t.quantity;
              
              // Update Running
              runningCost += (totalVal + fees);
              runningQty += t.quantity;
          } 
          else if (t.type === 'SELL') {
              // Effective Rate = (Price - Fees per share) ie. Net per share
              effectiveRate = (totalVal - fees) / t.quantity;

              // Calculate P&L for this specific trade
              const currentAvg = runningQty > 0 ? runningCost / runningQty : 0;
              const costOfSale = t.quantity * currentAvg;
              const netProceeds = totalVal - fees;
              
              costBasisPerShare = currentAvg;
              realizedPnL = netProceeds - costOfSale;

              // Update Running
              runningCost -= costOfSale;
              runningQty -= t.quantity;
          }
          else if (t.type === 'DIVIDEND') {
              effectiveRate = t.price; // Dividend per share
          }

          // Floating point safety
          if (runningQty < 0.001) { runningQty = 0; runningCost = 0; }

          return {
              ...t,
              effectiveRate,
              costBasisPerShare,
              realizedPnL
          };
      });

      // Reverse to show newest first
      return rows.reverse();
  }, [selectedTicker, transactions]);

  // 3. Filtering and Selection Logic
  const filteredOptions = useMemo(() => {
      if (!searchTerm) return allTickerStats;
      return allTickerStats.filter(s => 
          s.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
          s.sector.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [allTickerStats, searchTerm]);

  const selectedStats = useMemo(() => {
      if (!selectedTicker) return null;
      return allTickerStats.find(s => s.ticker === selectedTicker);
  }, [selectedTicker, allTickerStats]);

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
  const formatDecimal = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-7xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* --- SEARCH HEADER --- */}
      <div className="relative z-30 bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 mb-8 flex flex-col items-center justify-center text-center">
          <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Stock Analyzer</h2>
              <p className="text-slate-500 text-sm">Select a company to view position details, realized gains, and complete activity history.</p>
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
                      placeholder="Search Ticker (e.g. PPL)..."
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
                                       <div className={`font-bold text-sm ${stats.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                           {stats.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(stats.totalNetReturn)}
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

      {/* --- DASHBOARD VIEW --- */}
      <div className="relative z-10">
        {selectedStats ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                
                {/* 1. HEADER CARD */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner ${selectedStats.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
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
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Current Price</div>
                            <div className="text-xl font-bold text-slate-800">Rs. {selectedStats.currentPrice.toLocaleString()}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lifetime Net</div>
                            <div className={`text-2xl font-black ${selectedStats.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {selectedStats.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(selectedStats.totalNetReturn)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. STATS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Position Card */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Wallet size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Position & Gains</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-3xl font-bold text-slate-800">{selectedStats.ownedQty.toLocaleString()}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Owned Shares</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-slate-400">{selectedStats.soldQty.toLocaleString()}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Sold Shares</div>
                                </div>
                            </div>
                            <div className="h-px bg-slate-100 w-full"></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm font-bold text-slate-700">Rs. {formatDecimal(selectedStats.currentAvgPrice)}</div>
                                    <div className="text-[10px] text-slate-400">Current Avg Cost</div>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-700">Rs. {formatCurrency(selectedStats.currentValue)}</div>
                                    <div className="text-[10px] text-slate-400">Market Value</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div>
                                    <div className={`text-sm font-bold ${selectedStats.realizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {selectedStats.realizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStats.realizedPL)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 uppercase">Realized Gains</div>
                                </div>
                                <div>
                                    <div className={`text-sm font-bold ${selectedStats.unrealizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {selectedStats.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStats.unrealizedPL)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 uppercase">Unrealized Gains</div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Passive Income Card */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Coins size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Passive Income</h3>
                        </div>
                        <div className="space-y-6">
                             <div>
                                 <div className="text-3xl font-bold text-indigo-600">+{formatCurrency(selectedStats.netDividends)}</div>
                                 <div className="text-[10px] text-slate-400 font-bold uppercase">Net Dividends (After Tax)</div>
                             </div>
                             <div className="h-px bg-slate-100 w-full"></div>
                             <div className="flex justify-between items-center">
                                 <div>
                                     <div className="text-sm font-bold text-slate-700">{formatCurrency(selectedStats.totalDividends)}</div>
                                     <div className="text-[10px] text-slate-400">Gross Dividends</div>
                                 </div>
                                 <div className="text-right">
                                     <div className="text-sm font-bold text-rose-500">-{formatCurrency(selectedStats.dividendTax)}</div>
                                     <div className="text-[10px] text-slate-400">Tax Paid</div>
                                 </div>
                             </div>
                             <div className="flex gap-1 h-12 items-end mt-2 opacity-80">
                                 {[30, 45, 25, 60, 40, 70, 50].map((h, i) => (
                                     <div key={i} className="flex-1 bg-indigo-100 rounded-t-sm" style={{ height: `${h}%` }}></div>
                                 ))}
                             </div>
                        </div>
                    </Card>

                     {/* Costs Card */}
                     <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Receipt size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Costs & Fees</h3>
                        </div>
                        <div className="space-y-6">
                             <div>
                                 <div className="text-3xl font-bold text-rose-500">-{formatCurrency(selectedStats.feesPaid)}</div>
                                 <div className="text-[10px] text-slate-400 font-bold uppercase">Total Commission & Taxes</div>
                             </div>
                             <div className="h-px bg-slate-100 w-full"></div>
                             <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                 <div className="flex justify-between items-center mb-2">
                                     <span className="text-xs text-slate-500 font-bold uppercase">Total Trades</span>
                                     <span className="text-lg font-black text-slate-800">{selectedStats.tradeCount}</span>
                                 </div>
                                 <div className="w-full bg-slate-200 rounded-full h-2">
                                     <div className="bg-orange-400 h-2 rounded-full" style={{ width: '100%' }}></div>
                                 </div>
                             </div>
                        </div>
                    </Card>
                </div>

                {/* 3. DETAILED ACTIVITY TABLE */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                        <History size={20} className="text-slate-500" />
                        <h3 className="font-bold text-slate-800">All Time Activity for {selectedStats.ticker}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-4 py-4">Type</th>
                                    <th className="px-4 py-4 text-right">Qty</th>
                                    <th className="px-4 py-4 text-right">Price</th>
                                    <th className="px-4 py-4 text-right text-slate-700" title="Effective Price per share (inc. fees)">Eff. Rate</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Comm</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Tax</th>
                                    <th className="px-4 py-4 text-right text-slate-400">CDC</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Other</th>
                                    <th className="px-6 py-4 text-right">Net Amount</th>
                                    
                                    {/* Sell Specific Columns */}
                                    <th className="px-4 py-4 text-right text-blue-600 bg-blue-50/50">Buy Avg</th>
                                    <th className="px-6 py-4 text-right text-blue-600 bg-blue-50/50">Gain</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activityRows.map(t => {
                                    const net = t.type === 'BUY' 
                                        ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0))
                                        : t.type === 'SELL'
                                        ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0))
                                        : (t.quantity * t.price) - (t.tax||0); // Dividend

                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4 text-slate-500 font-mono text-xs">{t.date}</td>
                                            <td className="px-4 py-4">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                                                    t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    t.type === 'DIVIDEND' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100'
                                                }`}>{t.type}</span>
                                            </td>
                                            <td className="px-4 py-4 text-right text-slate-700 font-medium">{t.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-600 font-mono">{t.price.toLocaleString()}</td>
                                            
                                            {/* Effective Rate */}
                                            <td className="px-4 py-4 text-right font-mono text-xs font-bold text-slate-700">
                                                {t.effectiveRate ? formatDecimal(t.effectiveRate) : '-'}
                                            </td>

                                            {/* Detailed Fees */}
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.commission || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.tax || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.cdcCharges || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.otherFees || 0).toLocaleString()}</td>

                                            <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {formatCurrency(net)}
                                            </td>

                                            {/* Sell Specifics */}
                                            <td className="px-4 py-4 text-right font-mono text-xs bg-blue-50/30">
                                                {t.costBasisPerShare ? formatDecimal(t.costBasisPerShare) : ''}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono bg-blue-50/30">
                                                {t.realizedPnL !== undefined ? (
                                                    <span className={`font-bold ${t.realizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {t.realizedPnL >= 0 ? '+' : ''}{formatCurrency(t.realizedPnL)}
                                                    </span>
                                                ) : ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {activityRows.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">No transaction history found.</div>
                    )}
                </div>

            </div>
        ) : (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                    <BarChart3 size={48} />
                </div>
                <h3 className="text-xl font-bold text-slate-400">No Stock Selected</h3>
                <p className="text-slate-400">Use the search bar above to analyze a specific stock.</p>
            </div>
        )}
      </div>
    </div>
  );
};
