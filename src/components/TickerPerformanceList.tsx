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
  BarChart3,
  Percent
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
  avgBuyPrice: number;       
  sellOrCurrentPrice: number; 
  gain: number;              
  gainType: 'REALIZED' | 'UNREALIZED' | 'NONE';
  remainingQty?: number;
}

interface Lot {
    quantity: number;
    costPerShare: number; 
}

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Calculate Comprehensive Stats per Ticker using FIFO
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
          // Sort chronologically for FIFO
          const txs = transactions
              .filter(t => t.ticker === ticker)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          let ownedQty = 0;
          let soldQty = 0;
          let realizedPL = 0;     
          
          let totalDividends = 0;
          let dividendTax = 0;
          let feesPaid = 0;       
          
          let tradeCount = 0;
          let lifetimeBuyCost = 0; // Total capital ever put into this stock
          
          // FIFO Queue
          const lots: Lot[] = [];

          txs.forEach(t => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              
              if (t.type === 'BUY') {
                  const grossBuy = t.quantity * t.price;
                  const buyCost = grossBuy + fees; 
                  const costPerShare = buyCost / t.quantity;
                  
                  lots.push({ quantity: t.quantity, costPerShare });
                  
                  ownedQty += t.quantity;
                  lifetimeBuyCost += buyCost; // Track total invested
                  feesPaid += fees;
                  tradeCount++;
              } 
              else if (t.type === 'SELL') {
                  const grossSell = t.quantity * t.price;
                  const netSell = grossSell - fees;
                  
                  let qtyToSell = t.quantity;
                  let costBasisForSale = 0;

                  while (qtyToSell > 0 && lots.length > 0) {
                      const currentLot = lots[0]; 
                      if (currentLot.quantity > qtyToSell) {
                          costBasisForSale += qtyToSell * currentLot.costPerShare;
                          currentLot.quantity -= qtyToSell;
                          qtyToSell = 0;
                      } else {
                          costBasisForSale += currentLot.quantity * currentLot.costPerShare;
                          qtyToSell -= currentLot.quantity;
                          lots.shift(); 
                      }
                  }

                  const tradeProfit = netSell - costBasisForSale;
                  realizedPL += tradeProfit;

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

          if (ownedQty < 0.001) ownedQty = 0;

          // Calculate Current Avg Cost from remaining lots
          let remainingTotalCost = 0;
          let remainingTotalQty = 0;
          lots.forEach(lot => {
              remainingTotalCost += lot.quantity * lot.costPerShare;
              remainingTotalQty += lot.quantity;
          });
          const currentAvgPrice = remainingTotalQty > 0 ? remainingTotalCost / remainingTotalQty : 0;

          const currentPrice = currentPrices[ticker] || 0;
          const currentValue = ownedQty * currentPrice;
          const unrealizedPL = currentValue - remainingTotalCost;
          const totalNetReturn = realizedPL + unrealizedPL + (totalDividends - dividendTax);
          
          // ROI Calculation: Net Return / Total Capital Invested
          const lifetimeROI = lifetimeBuyCost > 0 ? (totalNetReturn / lifetimeBuyCost) * 100 : 0;

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
              tradeCount,
              lifetimeROI
          };
      }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [transactions, currentPrices, sectors]);

  // 2. Generate Detailed Activity Rows (Same as previous step)
  const activityRows = useMemo(() => {
      if (!selectedTicker) return [];

      const currentPrice = currentPrices[selectedTicker] || 0;

      const sortedTxs = transactions
          .filter(t => t.ticker === selectedTicker)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Simulation State
      const tempLots: { id: string, quantity: number, costPerShare: number }[] = [];
      const buyRemainingMap: Record<string, number> = {};
      const sellAnalysisMap: Record<string, { avgBuy: number, gain: number }> = {};

      // PASS 1: Simulation
      sortedTxs.forEach(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const totalVal = t.quantity * t.price;

          if (t.type === 'BUY') {
              const effRate = (totalVal + fees) / t.quantity;
              tempLots.push({ id: t.id, quantity: t.quantity, costPerShare: effRate });
              buyRemainingMap[t.id] = t.quantity;
          }
          else if (t.type === 'SELL') {
              const netProceeds = totalVal - fees;
              let qtyToSell = t.quantity;
              let costBasisForSale = 0;

              while (qtyToSell > 0 && tempLots.length > 0) {
                  const currentLot = tempLots[0];
                  const takeAmount = Math.min(qtyToSell, currentLot.quantity);
                  costBasisForSale += takeAmount * currentLot.costPerShare;
                  currentLot.quantity -= takeAmount;
                  qtyToSell -= takeAmount;

                  if (buyRemainingMap[currentLot.id] !== undefined) {
                      buyRemainingMap[currentLot.id] -= takeAmount;
                  }

                  if (currentLot.quantity < 0.0001) tempLots.shift();
              }

              const avgBuy = (t.quantity > 0) ? costBasisForSale / t.quantity : 0;
              const gain = netProceeds - costBasisForSale;
              sellAnalysisMap[t.id] = { avgBuy, gain };
          }
      });

      // PASS 2: Generation
      const rows: ActivityRow[] = sortedTxs.map(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const totalVal = t.quantity * t.price;
          
          let avgBuyPrice = 0;
          let sellOrCurrentPrice = 0;
          let gain = 0;
          let gainType: 'REALIZED' | 'UNREALIZED' | 'NONE' = 'NONE';
          let remainingQty = 0;

          if (t.type === 'BUY') {
              avgBuyPrice = (totalVal + fees) / t.quantity;
              sellOrCurrentPrice = currentPrice;
              remainingQty = buyRemainingMap[t.id] ?? 0;
              
              if (remainingQty < 0.001) remainingQty = 0;

              if (remainingQty > 0) {
                  gain = (sellOrCurrentPrice - avgBuyPrice) * remainingQty;
                  gainType = 'UNREALIZED';
              }
          } 
          else if (t.type === 'SELL') {
              const analysis = sellAnalysisMap[t.id];
              if (analysis) {
                  avgBuyPrice = analysis.avgBuy;
                  sellOrCurrentPrice = (totalVal - fees) / t.quantity;
                  gain = analysis.gain;
                  gainType = 'REALIZED';
              }
          }
          else if (t.type === 'DIVIDEND') {
              avgBuyPrice = 0;
              sellOrCurrentPrice = t.price; 
              gain = (t.quantity * t.price) - (t.tax || 0); 
              gainType = 'REALIZED';
          }

          return {
              ...t,
              avgBuyPrice,
              sellOrCurrentPrice,
              gain,
              gainType,
              remainingQty
          };
      });

      return rows.reverse();
  }, [selectedTicker, transactions, currentPrices]);

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

  const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                
                {/* HEADER CARD */}
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
                            <div className="text-xl font-bold text-slate-800">Rs. {formatDecimal(selectedStats.currentPrice)}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lifetime Net</div>
                            <div className={`text-2xl font-black ${selectedStats.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {selectedStats.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(selectedStats.totalNetReturn)}
                            </div>
                        </div>
                        <div className="h-8 w-px bg-slate-200"></div>
                        {/* ADDED ROI SECTION */}
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center justify-end gap-1">
                                Lifetime ROI
                            </div>
                            <div className={`text-2xl font-black flex items-center justify-end gap-1 ${selectedStats.lifetimeROI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {selectedStats.lifetimeROI >= 0 ? '+' : ''}{formatDecimal(selectedStats.lifetimeROI)}%
                            </div>
                        </div>
                    </div>
                </div>

                {/* STATS GRID */}
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

                {/* DETAILED ACTIVITY TABLE */}
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
                                    
                                    <th className="px-4 py-4 text-right text-slate-700" title="Effective Buy Rate or Cost Basis">Avg Buy Price</th>
                                    <th className="px-4 py-4 text-right text-slate-700" title="Effective Sell Rate or Current Market Price">Sell / Current</th>

                                    <th className="px-4 py-4 text-right text-slate-400">Comm</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Tax</th>
                                    <th className="px-4 py-4 text-right text-slate-400">CDC</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Other</th>
                                    <th className="px-6 py-4 text-right">Net Amount</th>
                                    
                                    <th className="px-6 py-4 text-right text-emerald-600 bg-emerald-50/30">Realized Gain</th>
                                    <th className="px-6 py-4 text-right text-blue-600 bg-blue-50/30">Unrealized Gain</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activityRows.map(t => {
                                    const net = t.type === 'BUY' 
                                        ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0))
                                        : t.type === 'SELL'
                                        ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0))
                                        : (t.quantity * t.price) - (t.tax||0); 

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
                                            
                                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-600">
                                                {t.type === 'DIVIDEND' ? '-' : formatDecimal(t.avgBuyPrice)}
                                            </td>

                                            <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${t.type === 'SELL' ? 'text-emerald-600' : t.type === 'BUY' ? 'text-rose-500' : 'text-indigo-600'}`}>
                                                {formatDecimal(t.sellOrCurrentPrice)}
                                            </td>

                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.commission || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.tax || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.cdcCharges || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.otherFees || 0).toLocaleString()}</td>

                                            <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {formatCurrency(net)}
                                            </td>

                                            {/* REALIZED GAIN COLUMN */}
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-emerald-50/30 ${t.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {t.gainType === 'REALIZED' ? (
                                                    <>
                                                        {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)}
                                                    </>
                                                ) : '-'}
                                            </td>

                                            {/* UNREALIZED GAIN COLUMN */}
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-blue-50/30 ${t.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {t.gainType === 'UNREALIZED' ? (
                                                    <>
                                                        {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)}
                                                        {t.remainingQty && t.remainingQty < t.quantity && (
                                                            <span className="block text-[8px] opacity-60 font-sans font-normal text-slate-500 mt-0.5">
                                                                (On {t.remainingQty.toLocaleString()})
                                                            </span>
                                                        )}
                                                    </>
                                                ) : '-'}
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
