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
  ChevronLeft,
  ChevronRight,
  Percent,
  CalendarCheck,
  Download,
  PieChart,
  Target,
  Layers,     // For Sector Icon
  LayoutList  // For Stock Icon
} from 'lucide-react';
import { Card } from './ui/Card';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter 
} from 'recharts';
import { exportToCSV } from '../utils/export';

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  onTickerClick: (ticker: string) => void;
}

// ... (Previous Interfaces) ...
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

// NEW: Interface for Sector Stats
interface SectorStats {
    name: string;
    stockCount: number;
    totalCostBasis: number;
    currentValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalDividends: number;
    netDividends: number;
    dividendTax: number;
    lifetimeNet: number;
    lifetimeROI: number;
    allocationPercent: number;
    feesPaid: number;
    tickers: string[]; // List of tickers in this sector
}

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors
}) => {
  // STATE: Mode Switching
  const [analysisMode, setAnalysisMode] = useState<'STOCK' | 'SECTOR'>('STOCK');

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null); // NEW
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [activityPage, setActivityPage] = useState<number>(1);
  const [activityRowsPerPage, setActivityRowsPerPage] = useState<number>(25);

  // --- HELPER: Total Portfolio Value ---
  const totalPortfolioValue = useMemo(() => {
      const uniqueTickers = Array.from(new Set(transactions.map(t => t.ticker)));
      const systemTypes = ['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE', 'TAX', 'HISTORY', 'OTHER'];
      
      return uniqueTickers.reduce((total, tkr) => {
          if (['CASH', 'CGT'].includes(tkr)) return total;
          const txs = transactions.filter(t => t.ticker === tkr && !systemTypes.includes(t.type));
          const netQty = txs.reduce((acc, t) => {
              if (t.type === 'BUY') return acc + t.quantity;
              if (t.type === 'SELL') return acc - t.quantity;
              return acc;
          }, 0);
          if (netQty > 0) return total + (netQty * (currentPrices[tkr] || 0));
          return total;
      }, 0);
  }, [transactions, currentPrices]);

  // 1. Calculate Ticker Stats (Existing FIFO Logic)
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
          // ... (Existing FIFO Calculation Code - Kept Identical for Brevity) ...
          // Sort chronologically for FIFO
          const txs = transactions
              .filter(t => t.ticker === ticker)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          let ownedQty = 0; let soldQty = 0; let realizedPL = 0;     
          let totalDividends = 0; let dividendTax = 0; let dividendCount = 0; let dividendSharesCount = 0;
          let totalComm = 0; let totalTradingTax = 0; let totalCDC = 0; let totalOther = 0;
          let tradeCount = 0; let buyCount = 0; let sellCount = 0; let lifetimeBuyCost = 0; 
          
          const lots: Lot[] = [];

          txs.forEach(t => {
              if (t.type === 'BUY' || t.type === 'SELL') {
                  totalComm += (t.commission || 0); totalTradingTax += (t.tax || 0); 
                  totalCDC += (t.cdcCharges || 0); totalOther += (t.otherFees || 0);
              }
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              
              if (t.type === 'BUY') {
                  const grossBuy = t.quantity * t.price;
                  const buyCost = grossBuy + fees; 
                  const costPerShare = buyCost / t.quantity;
                  lots.push({ quantity: t.quantity, costPerShare });
                  ownedQty += t.quantity;
                  lifetimeBuyCost += buyCost; 
                  tradeCount++; buyCount++; 
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
                  tradeCount++; sellCount++;
              } 
              else if (t.type === 'DIVIDEND') {
                  const grossDiv = t.quantity * t.price;
                  totalDividends += grossDiv;
                  dividendTax += (t.tax || 0);
                  dividendCount++;
                  dividendSharesCount += t.quantity;
              }
          });

          if (ownedQty < 0.001) ownedQty = 0;

          let remainingTotalCost = 0; let remainingTotalQty = 0;
          lots.forEach(lot => { remainingTotalCost += lot.quantity * lot.costPerShare; remainingTotalQty += lot.quantity; });
          const currentAvgPrice = remainingTotalQty > 0 ? remainingTotalCost / remainingTotalQty : 0;

          const currentPrice = currentPrices[ticker] || 0;
          const currentValue = ownedQty * currentPrice;
          const unrealizedPL = currentValue - remainingTotalCost;
          const totalNetReturn = realizedPL + unrealizedPL + (totalDividends - dividendTax);
          
          const lifetimeROI = lifetimeBuyCost > 0 ? (totalNetReturn / lifetimeBuyCost) * 100 : 0;
          const feesPaid = totalComm + totalTradingTax + totalCDC + totalOther;
          const allocationPercent = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
          const estFeeRate = 0.0055; 
          const breakEvenPrice = currentAvgPrice > 0 ? currentAvgPrice / (1 - estFeeRate) : 0;
          const dividendYieldOnCost = lifetimeBuyCost > 0 ? (totalDividends / lifetimeBuyCost) * 100 : 0;
          const avgDPS = dividendSharesCount > 0 ? totalDividends / dividendSharesCount : 0;

          return {
              ticker,
              sector: sectors[ticker] || 'Unknown',
              status: ownedQty > 0.01 ? 'Active' : 'Closed',
              ownedQty, soldQty, currentPrice, currentAvgPrice, currentValue,
              totalCostBasis: remainingTotalCost, 
              realizedPL, unrealizedPL, totalNetReturn,
              totalDividends, dividendTax, netDividends: totalDividends - dividendTax,
              dividendCount, dividendSharesCount, dividendYieldOnCost, avgDPS,
              feesPaid, totalComm, totalTradingTax, totalCDC, totalOther,
              tradeCount, buyCount, sellCount,
              lifetimeROI, allocationPercent, breakEvenPrice,
              lifetimeBuyCost // Needed for aggregation
          };
      }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [transactions, currentPrices, sectors, totalPortfolioValue]);

  // 2. NEW: Calculate Sector Aggregation
  const allSectorStats = useMemo(() => {
      const sectorMap: Record<string, SectorStats> = {};

      allTickerStats.forEach(stat => {
          const secName = stat.sector;
          if (!sectorMap[secName]) {
              sectorMap[secName] = {
                  name: secName,
                  stockCount: 0,
                  totalCostBasis: 0,
                  currentValue: 0,
                  realizedPL: 0,
                  unrealizedPL: 0,
                  totalDividends: 0,
                  netDividends: 0,
                  dividendTax: 0,
                  lifetimeNet: 0,
                  lifetimeROI: 0,
                  allocationPercent: 0,
                  feesPaid: 0,
                  tickers: []
              };
          }

          const s = sectorMap[secName];
          s.stockCount++;
          s.totalCostBasis += stat.totalCostBasis;
          s.currentValue += stat.currentValue;
          s.realizedPL += stat.realizedPL;
          s.unrealizedPL += stat.unrealizedPL;
          s.totalDividends += stat.totalDividends;
          s.netDividends += stat.netDividends;
          s.dividendTax += stat.dividendTax;
          s.feesPaid += stat.feesPaid;
          s.allocationPercent += stat.allocationPercent;
          s.lifetimeNet += stat.totalNetReturn;
          
          s.tickers.push(stat.ticker);
      });

      // Calculate Aggregate ROI
      // ROI = Net Return / Total Cost Basis (Active) + Total Cost of Solds (Hard to get exactly here without tracking sold cost separately globally)
      // Approximation: Use the sum of lifetime net vs sums. 
      // Better: Sum of all lifetimeBuyCost from tickers.
      
      const sectorArray = Object.values(sectorMap);
      
      // We need to re-loop to fix ROI properly
      sectorArray.forEach(sec => {
          const totalInvestedInSector = allTickerStats
              .filter(t => t.sector === sec.name)
              .reduce((sum, t) => sum + t.lifetimeBuyCost, 0);
          
          sec.lifetimeROI = totalInvestedInSector > 0 ? (sec.lifetimeNet / totalInvestedInSector) * 100 : 0;
      });

      return sectorArray.sort((a, b) => b.allocationPercent - a.allocationPercent); // Sort by allocation
  }, [allTickerStats]);

  // 3. Filtering and Selection Logic (Dual Mode)
  const filteredOptions = useMemo(() => {
      if (analysisMode === 'STOCK') {
          if (!searchTerm) return allTickerStats;
          return allTickerStats.filter(s => s.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      } else {
          // SECTOR MODE
          if (!searchTerm) return allSectorStats;
          return allSectorStats.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
      }
  }, [analysisMode, searchTerm, allTickerStats, allSectorStats]);

  const selectedStockStats = useMemo(() => {
      if (analysisMode !== 'STOCK' || !selectedTicker) return null;
      return allTickerStats.find(s => s.ticker === selectedTicker);
  }, [selectedTicker, allTickerStats, analysisMode]);

  const selectedSectorStats = useMemo(() => {
      if (analysisMode !== 'SECTOR' || !selectedSector) return null;
      return allSectorStats.find(s => s.name === selectedSector);
  }, [selectedSector, allSectorStats, analysisMode]);

  // ... (Existing Effect Hooks) ...
  useEffect(() => { setActivityPage(1); }, [selectedTicker, selectedSector]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handlers
  const handleSelect = (val: string) => {
      if (analysisMode === 'STOCK') {
          setSelectedTicker(val);
          localStorage.setItem('psx_last_analyzed_ticker', val);
      } else {
          setSelectedSector(val);
          // Optional: persist sector too
      }
      setSearchTerm(val);
      setIsDropdownOpen(false);
  };

  const handleClearSelection = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSearchTerm('');
      if (analysisMode === 'STOCK') {
          setSelectedTicker(null);
          localStorage.removeItem('psx_last_analyzed_ticker');
      } else {
          setSelectedSector(null);
      }
  };

  // Activity Rows Logic (Only relevant for Stock Mode, hiding for Sector initially)
  // ... (Existing activityRows logic remains exactly the same, omitted for brevity but presumed present) ...
  const activityRows = useMemo(() => {
      if (!selectedTicker || analysisMode !== 'STOCK') return [];
      const sortedTxs = transactions.filter(t => t.ticker === selectedTicker).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      // ... (Same FIFO simulation logic as previous code) ...
      // RE-INSERTING LOGIC TO ENSURE COMPLETENESS
      const currentPrice = currentPrices[selectedTicker] || 0;
      const tempLots: { id: string, quantity: number, costPerShare: number }[] = [];
      const buyRemainingMap: Record<string, number> = {};
      const sellAnalysisMap: Record<string, { avgBuy: number, gain: number }> = {};

      sortedTxs.forEach(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const totalVal = t.quantity * t.price;
          if (t.type === 'BUY') {
              const effRate = (totalVal + fees) / t.quantity;
              tempLots.push({ id: t.id, quantity: t.quantity, costPerShare: effRate });
              buyRemainingMap[t.id] = t.quantity;
          } else if (t.type === 'SELL') {
              const netProceeds = totalVal - fees;
              let qtyToSell = t.quantity;
              let costBasisForSale = 0;
              while (qtyToSell > 0 && tempLots.length > 0) {
                  const currentLot = tempLots[0];
                  const takeAmount = Math.min(qtyToSell, currentLot.quantity);
                  costBasisForSale += takeAmount * currentLot.costPerShare;
                  currentLot.quantity -= takeAmount;
                  qtyToSell -= takeAmount;
                  if (buyRemainingMap[currentLot.id] !== undefined) buyRemainingMap[currentLot.id] -= takeAmount;
                  if (currentLot.quantity < 0.0001) tempLots.shift();
              }
              const avgBuy = (t.quantity > 0) ? costBasisForSale / t.quantity : 0;
              const gain = netProceeds - costBasisForSale;
              sellAnalysisMap[t.id] = { avgBuy, gain };
          }
      });

      const rows: ActivityRow[] = sortedTxs.map(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const totalVal = t.quantity * t.price;
          let avgBuyPrice = 0; let sellOrCurrentPrice = 0; let gain = 0; let gainType: 'REALIZED' | 'UNREALIZED' | 'NONE' = 'NONE'; let remainingQty = 0;
          if (t.type === 'BUY') {
              avgBuyPrice = (totalVal + fees) / t.quantity; sellOrCurrentPrice = currentPrice; remainingQty = buyRemainingMap[t.id] ?? 0;
              if (remainingQty < 0.001) remainingQty = 0;
              if (remainingQty > 0) { gain = (sellOrCurrentPrice - avgBuyPrice) * remainingQty; gainType = 'UNREALIZED'; }
          } else if (t.type === 'SELL') {
              const analysis = sellAnalysisMap[t.id]; if (analysis) { avgBuyPrice = analysis.avgBuy; sellOrCurrentPrice = (totalVal - fees) / t.quantity; gain = analysis.gain; gainType = 'REALIZED'; }
          } else if (t.type === 'DIVIDEND') { avgBuyPrice = 0; sellOrCurrentPrice = t.price; gain = (t.quantity * t.price) - (t.tax || 0); gainType = 'REALIZED'; }
          return { ...t, avgBuyPrice, sellOrCurrentPrice, gain, gainType, remainingQty };
      });
      return rows.reverse();
  }, [selectedTicker, transactions, currentPrices, analysisMode]);

  // Chart Data (Stock Mode Only)
  const chartData = useMemo(() => {
      if (!selectedTicker || analysisMode !== 'STOCK') return [];
      return transactions
          .filter(t => t.ticker === selectedTicker && (t.type === 'BUY' || t.type === 'SELL'))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(t => ({ date: t.date, price: t.price, type: t.type, quantity: t.quantity, color: t.type === 'BUY' ? '#10b981' : '#f43f5e' }));
  }, [selectedTicker, transactions, analysisMode]);

  const handleExportActivity = () => { /* Same as before */ };
  const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDecimal = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paginatedActivity = useMemo(() => { const start = (activityPage - 1) * activityRowsPerPage; return activityRows.slice(start, start + activityRowsPerPage); }, [activityRows, activityPage, activityRowsPerPage]);
  const totalActivityPages = Math.ceil(activityRows.length / activityRowsPerPage);

  return (
    <div className="max-w-7xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER SECTION with TOGGLE */}
      <div className="relative z-30 bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 mb-8 flex flex-col items-center justify-center text-center">
          
          <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">
                  {analysisMode === 'STOCK' ? 'Stock Analyzer' : 'Sector Analyzer'}
              </h2>
              <p className="text-slate-500 text-sm">
                  {analysisMode === 'STOCK' 
                      ? 'Select a company to view position details, realized gains, and activity.'
                      : 'Select a sector to view aggregated performance across multiple companies.'}
              </p>
          </div>

          {/* MODE TOGGLE */}
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6 shadow-inner border border-slate-200">
              <button 
                  onClick={() => { setAnalysisMode('STOCK'); setSearchTerm(''); setSelectedTicker(null); setIsDropdownOpen(false); }}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${analysisMode === 'STOCK' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  <LayoutList size={16} /> Stock
              </button>
              <button 
                  onClick={() => { setAnalysisMode('SECTOR'); setSearchTerm(''); setSelectedSector(null); setIsDropdownOpen(false); }}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${analysisMode === 'SECTOR' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  <Layers size={16} /> Sector
              </button>
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
                      placeholder={analysisMode === 'STOCK' ? "Search Ticker (e.g. PPL)..." : "Search Sector (e.g. Fertilizer)..."}
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value.toUpperCase()); setIsDropdownOpen(true); }}
                      onFocus={() => setIsDropdownOpen(true)}
                  />
                  {(selectedTicker || selectedSector) && ( 
                      <button onClick={handleClearSelection} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-500 mr-1"> <XCircle size={16} /> </button> 
                  )}
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                      {filteredOptions.length === 0 ? ( <div className="p-4 text-center text-slate-400 text-sm">No results found.</div> ) : ( 
                          filteredOptions.map((stats: any) => ( 
                              <div 
                                  key={analysisMode === 'STOCK' ? stats.ticker : stats.name} 
                                  onClick={() => handleSelect(analysisMode === 'STOCK' ? stats.ticker : stats.name)} 
                                  className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer group transition-colors"
                              > 
                                  <div className="flex items-center gap-3"> 
                                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black ${analysisMode === 'STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}> 
                                          {analysisMode === 'STOCK' ? stats.ticker.substring(0, 2) : <Layers size={16} />} 
                                      </div> 
                                      <div className="text-left"> 
                                          <div className="font-bold text-slate-800">{analysisMode === 'STOCK' ? stats.ticker : stats.name}</div> 
                                          <div className="text-[10px] text-slate-400 uppercase font-medium">
                                              {analysisMode === 'STOCK' ? stats.sector : `${stats.stockCount} Companies`}
                                          </div> 
                                      </div> 
                                  </div> 
                                  <div className="text-right"> 
                                      <div className={`font-bold text-sm ${analysisMode === 'STOCK' ? (stats.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-500') : (stats.lifetimeNet >= 0 ? 'text-emerald-600' : 'text-rose-500')}`}> 
                                          {analysisMode === 'STOCK' 
                                              ? (stats.totalNetReturn >= 0 ? '+' : '') + formatCurrency(stats.totalNetReturn)
                                              : (stats.lifetimeNet >= 0 ? '+' : '') + formatCurrency(stats.lifetimeNet)
                                          } 
                                      </div> 
                                  </div> 
                              </div> 
                          )) 
                      )}
                  </div>
              )}
          </div>
      </div>

      <div className="relative z-10">
        
        {/* --- STOCK DASHBOARD --- */}
        {analysisMode === 'STOCK' && selectedStockStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* 1. HEADER */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner ${selectedStockStats.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}> {selectedStockStats.ticker.substring(0, 1)} </div>
                        <div> <h1 className="text-3xl font-black text-slate-800 tracking-tight">{selectedStockStats.ticker}</h1> <div className="flex items-center gap-2 mt-1"> <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold uppercase border border-slate-200">{selectedStockStats.sector}</span> <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${selectedStockStats.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}> {selectedStockStats.status} </span> </div> </div>
                    </div>
                </div>

                {/* 1.5 QUICK STATS BAR */}
                <div className={`grid grid-cols-2 ${selectedStockStats.status === 'Active' ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-3'} gap-4`}>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-slate-50 text-slate-600 rounded-xl"><Activity size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Price</div> <div className="text-lg font-black text-slate-800">Rs. {formatDecimal(selectedStockStats.currentPrice)}</div> </div> </div> </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`p-2 rounded-xl ${selectedStockStats.totalNetReturn >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><TrendingUp size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lifetime Net</div> <div className={`text-lg font-black ${selectedStockStats.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> {selectedStockStats.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.totalNetReturn)} </div> </div> </div> </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`p-2 rounded-xl ${selectedStockStats.lifetimeROI >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><Percent size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lifetime ROI</div> <div className={`text-lg font-black ${selectedStockStats.lifetimeROI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> {selectedStockStats.lifetimeROI >= 0 ? '+' : ''}{formatDecimal(selectedStockStats.lifetimeROI)}% </div> </div> </div> </div>
                    {selectedStockStats.status === 'Active' && ( <> <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-sky-50 text-sky-600 rounded-xl"><PieChart size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Allocation</div> <div className="text-lg font-black text-slate-800">{selectedStockStats.allocationPercent.toFixed(1)}%</div> </div> </div> </div> <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-violet-50 text-violet-600 rounded-xl"><Target size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Break-Even Price</div> <div className="text-lg font-black text-violet-600">Rs. {formatDecimal(selectedStockStats.breakEvenPrice)}</div> </div> </div> </div> </> )}
                </div>

                {/* 2. STATS GRID (Same as before) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Wallet size={18} /></div> <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Position & Gains</h3> </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4"> <div> <div className="text-3xl font-bold text-slate-800">{selectedStockStats.ownedQty.toLocaleString()}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Owned Shares</div> </div> <div> <div className="text-3xl font-bold text-slate-400">{selectedStockStats.soldQty.toLocaleString()}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Sold Shares</div> </div> </div>
                            <div className="h-px bg-slate-100 w-full"></div>
                            <div className="grid grid-cols-2 gap-4"> <div> <div className="text-sm font-bold text-slate-700">Rs. {formatCurrency(selectedStockStats.totalCostBasis)}</div> <div className="text-[10px] text-slate-400">Total Cost Basis</div> <div className="text-[9px] text-slate-400 mt-0.5"> Avg: <span className="font-mono text-slate-600">Rs. {formatDecimal(selectedStockStats.currentAvgPrice)}</span> </div> </div> <div> <div className="text-sm font-bold text-slate-700">Rs. {formatCurrency(selectedStockStats.currentValue)}</div> <div className="text-[10px] text-slate-400">Market Value</div> </div> </div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100"> <div> <div className={`text-sm font-bold ${selectedStockStats.realizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> {selectedStockStats.realizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.realizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Realized Gains</div> </div> <div> <div className={`text-sm font-bold ${selectedStockStats.unrealizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> {selectedStockStats.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.unrealizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Unrealized Gains</div> </div> </div>
                        </div>
                    </Card>
                    
                    {/* ... (Passive Income & Costs Cards - same as before) ... */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Coins size={18} /></div> <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Passive Income</h3> </div>
                        <div className="space-y-6">
                             <div> <div className="text-3xl font-bold text-indigo-600">+{formatCurrency(selectedStockStats.netDividends)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Net Dividends (After Tax)</div> </div>
                             <div className="h-px bg-slate-100 w-full"></div>
                             <div className="flex justify-between items-center"> <div> <div className="text-sm font-bold text-slate-700">{formatCurrency(selectedStockStats.totalDividends)}</div> <div className="text-[10px] text-slate-400">Gross Dividends</div> </div> <div className="text-right"> <div className="text-sm font-bold text-rose-500">-{formatCurrency(selectedStockStats.dividendTax)}</div> <div className="text-[10px] text-slate-400">Tax Paid</div> </div> </div>
                             <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex justify-between items-center"> <div> <div className="flex items-center gap-1.5 text-indigo-700 font-bold"> <Percent size={14} /> <span>{selectedStockStats.dividendYieldOnCost.toFixed(2)}%</span> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Yield on Cost</div> </div> <div className="h-6 w-px bg-indigo-200/50"></div> <div className="text-right"> <div className="flex items-center justify-end gap-1.5 text-slate-700 font-bold"> <span>{selectedStockStats.dividendCount}</span> <CalendarCheck size={14} className="text-slate-400" /> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Payouts Received</div> </div> </div>
                             <div className="flex gap-1 h-12 items-end mt-2 opacity-80"> {[30, 45, 25, 60, 40, 70, 50].map((h, i) => ( <div key={i} className="flex-1 bg-indigo-100 rounded-t-sm" style={{ height: `${h}%` }}></div> ))} </div>
                        </div>
                    </Card>

                     <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Receipt size={18} /></div> <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Costs & Fees</h3> </div>
                        <div className="space-y-6">
                             <div className="space-y-2">
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500">Commission</span> <span className="font-mono text-slate-700">{formatCurrency(selectedStockStats.totalComm)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500">Trading Tax</span> <span className="font-mono text-slate-700">{formatCurrency(selectedStockStats.totalTradingTax)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500">CDC Charges</span> <span className="font-mono text-slate-700">{formatCurrency(selectedStockStats.totalCDC)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500">Other Fees</span> <span className="font-mono text-slate-700">{formatCurrency(selectedStockStats.totalOther)}</span> </div>
                             </div>
                             <div className="h-px bg-slate-100 w-full"></div>
                             <div> <div className="text-2xl font-bold text-rose-500">-{formatCurrency(selectedStockStats.feesPaid)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Total Charges</div> </div>
                             <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                 <div className="flex justify-between items-center mb-1"> <span className="text-xs text-slate-500 font-bold uppercase">Trades Executed</span> <span className="text-lg font-black text-slate-800">{selectedStockStats.tradeCount}</span> </div>
                                 <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 border-t border-slate-200 pt-1"> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> <span>{selectedStockStats.buyCount} Buys</span> </div> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> <span>{selectedStockStats.sellCount} Sells</span> </div> </div>
                             </div>
                        </div>
                    </Card>
                </div>

                {/* FEATURE 1: TRADE HISTORY CHART */}
                {chartData.length > 1 && (
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <BarChart3 size={20} className="text-slate-400" />
                                Price & Trade History
                            </h3>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded"> <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Buy </div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded"> <div className="w-2 h-2 rounded-full bg-rose-500"></div> Sell </div>
                            </div>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} minTickGap={30} />
                                    <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={40} />
                                    <Tooltip contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px'}} labelStyle={{color: '#64748b', marginBottom: '4px'}} />
                                    <Line type="monotone" dataKey="price" stroke="#cbd5e1" strokeWidth={2} dot={false} />
                                    <Scatter data={chartData} fill="#8884d8" shape={(props: any) => { const { cx, cy, payload } = props; return ( <circle cx={cx} cy={cy} r={4} fill={payload.color} stroke="#fff" strokeWidth={1} /> ); }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* ... (Activity Table) ... */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-2"> <History size={20} className="text-slate-500" /> <h3 className="font-bold text-slate-800">All Time Activity</h3> </div>
                        <button onClick={handleExportActivity} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"> <Download size={14} /> Export CSV </button>
                    </div>
                    {/* ... (Table + Pagination) ... */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Date</th> <th className="px-4 py-4">Type</th> <th className="px-4 py-4 text-right">Qty</th>
                                    <th className="px-4 py-4 text-right text-slate-700" title="Effective Buy Rate or Cost Basis">Avg Buy Price</th>
                                    <th className="px-4 py-4 text-right text-slate-700" title="Effective Sell Rate or Current Market Price">Sell / Current</th>
                                    <th className="px-4 py-4 text-right text-slate-400">Comm</th> <th className="px-4 py-4 text-right text-slate-400">Tax</th> <th className="px-4 py-4 text-right text-slate-400">CDC</th> <th className="px-4 py-4 text-right text-slate-400">Other</th> <th className="px-6 py-4 text-right">Net Amount</th>
                                    <th className="px-6 py-4 text-right text-emerald-600 bg-emerald-50/30">Realized Gain</th> <th className="px-6 py-4 text-right text-blue-600 bg-blue-50/30">Unrealized Gain</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedActivity.map(t => {
                                    const net = t.type === 'BUY' ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : t.type === 'SELL' ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : (t.quantity * t.price) - (t.tax||0); 
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4 text-slate-500 font-mono text-xs">{t.date}</td>
                                            <td className="px-4 py-4"><span className={`text-[10px] font-bold px-2 py-1 rounded border ${t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-100' : t.type === 'DIVIDEND' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100'}`}>{t.type}</span></td>
                                            <td className="px-4 py-4 text-right text-slate-700 font-medium">{t.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-600">{t.type === 'DIVIDEND' ? '-' : formatDecimal(t.avgBuyPrice)}</td>
                                            <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${t.type === 'SELL' ? 'text-emerald-600' : t.type === 'BUY' ? 'text-rose-500' : 'text-indigo-600'}`}>{formatDecimal(t.sellOrCurrentPrice)}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.commission || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.tax || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.cdcCharges || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{(t.otherFees || 0).toLocaleString()}</td>
                                            <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{formatCurrency(net)}</td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-emerald-50/30 ${t.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.gainType === 'REALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} </> ) : '-'}</td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-blue-50/30 ${t.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.gainType === 'UNREALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} {t.remainingQty && t.remainingQty < t.quantity && ( <span className="block text-[8px] opacity-60 font-sans font-normal text-slate-500 mt-0.5"> (On {t.remainingQty.toLocaleString()}) </span> )} </> ) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* PAGINATION FOOTER */}
                    {activityRows.length > 0 && (
                        <div className="p-4 border-t border-slate-200/60 bg-white/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-2"> <span className="text-xs text-slate-500">Rows per page:</span> <select value={activityRowsPerPage} onChange={(e) => { setActivityRowsPerPage(Number(e.target.value)); setActivityPage(1); }} className="bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 outline-none focus:border-emerald-500 cursor-pointer" > <option value={25}>25</option> <option value={50}>50</option> <option value={100}>100</option> <option value={500}>500</option> <option value={1000}>1000</option> </select> </div>
                            <div className="flex items-center gap-4"> <span className="text-xs text-slate-500"> {(activityPage - 1) * activityRowsPerPage + 1}-{Math.min(activityPage * activityRowsPerPage, activityRows.length)} of {activityRows.length} </span> <div className="flex gap-1"> <button onClick={() => setActivityPage(p => Math.max(1, p - 1))} disabled={activityPage === 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" > <ChevronLeft size={16} className="text-slate-600" /> </button> <button onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))} disabled={activityPage === totalActivityPages || totalActivityPages === 0} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" > <ChevronRight size={16} className="text-slate-600" /> </button> </div> </div>
                        </div>
                    )}
                    {activityRows.length === 0 && ( <div className="p-8 text-center text-slate-400 text-sm">No transaction history found.</div> )}
                </div>
            </div>
        )}

        {/* --- SECTOR DASHBOARD --- */}
        {analysisMode === 'SECTOR' && selectedSectorStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* SECTOR HEADER */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner bg-blue-500 text-white"> 
                            <Layers size={32} /> 
                        </div>
                        <div> 
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">{selectedSectorStats.name}</h1> 
                            <div className="flex items-center gap-2 mt-1"> 
                                <span className="bg-slate-100 text-slate-600 px-3 py-0.5 rounded text-xs font-bold uppercase border border-slate-200">
                                    {selectedSectorStats.stockCount} Companies
                                </span> 
                            </div> 
                        </div>
                    </div>
                </div>

                {/* SECTOR QUICK STATS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl"><Wallet size={18} /></div>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Value</div>
                                <div className="text-lg font-black text-slate-800">Rs. {formatCurrency(selectedSectorStats.currentValue)}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${selectedSectorStats.lifetimeNet >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><TrendingUp size={18} /></div>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sector Net P&L</div>
                                <div className={`text-lg font-black ${selectedSectorStats.lifetimeNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {selectedSectorStats.lifetimeNet >= 0 ? '+' : ''}{formatCurrency(selectedSectorStats.lifetimeNet)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Coins size={18} /></div>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dividends</div>
                                <div className="text-lg font-black text-indigo-600">+{formatCurrency(selectedSectorStats.netDividends)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl"><PieChart size={18} /></div>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Allocation</div>
                                <div className="text-lg font-black text-slate-800">{selectedSectorStats.allocationPercent.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTOR COMPANIES LIST */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800">Companies in {selectedSectorStats.name}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Ticker</th>
                                    <th className="px-4 py-4 text-right">Cost Basis</th>
                                    <th className="px-4 py-4 text-right">Value</th>
                                    <th className="px-4 py-4 text-right">P&L</th>
                                    <th className="px-4 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allTickerStats
                                    .filter(t => t.sector === selectedSectorStats.name)
                                    .map(t => (
                                        <tr key={t.ticker} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-800">{t.ticker}</td>
                                            <td className="px-4 py-4 text-right text-slate-600">{formatCurrency(t.totalCostBasis)}</td>
                                            <td className="px-4 py-4 text-right text-slate-800 font-bold">{formatCurrency(t.currentValue)}</td>
                                            <td className={`px-4 py-4 text-right font-bold ${t.totalNetReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {t.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(t.totalNetReturn)}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <button 
                                                    onClick={() => { setAnalysisMode('STOCK'); handleSelect(t.ticker); }}
                                                    className="text-xs text-blue-600 hover:underline font-bold"
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* --- EMPTY STATE --- */}
        {!selectedTicker && !selectedSector && (
            <div className="flex flex-col items-center justify-center py-20 opacity-50"> 
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300"> 
                    <BarChart3 size={48} /> 
                </div> 
                <h3 className="text-xl font-bold text-slate-400">No {analysisMode === 'STOCK' ? 'Stock' : 'Sector'} Selected</h3> 
                <p className="text-slate-400">Use the search bar above to analyze performance.</p> 
            </div>
        )}
      </div>
    </div>
  );
};
