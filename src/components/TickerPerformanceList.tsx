import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Layers,     
  LayoutList, 
  TrendingUp, 
  Activity,
  Loader2,
  FileText,
  RefreshCw,
  Clock 
} from 'lucide-react';
import { Card } from './ui/Card';
import { exportToCSV } from '../utils/export';
import { fetchCompanyFundamentals, FundamentalsData } from '../services/financials';

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  onTickerClick: (ticker: string) => void;
}

interface ActivityRow extends Transaction {
  avgBuyPrice: number;       
  sellOrCurrentPrice: number; 
  gain: number;              
  gainType: 'REALIZED' | 'UNREALIZED' | 'NONE';
  remainingQty?: number;
}

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
    totalComm: number;
    totalTradingTax: number;
    totalCDC: number;
    totalOther: number;
    tradeCount: number;
    buyCount: number;
    sellCount: number;
    dividendYieldOnCost: number;
    ownedQty: number;
    soldQty: number;
    dividendCount: number;
    tickers: string[];
}

const getHoldingDuration = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();

    if (days < 0) {
        months--;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    
    if (years > 0) return `${years}Y ${months}M`;
    if (months > 0) return `${months}M ${days}D`;
    return `${days} Days`;
};

export const TickerPerformanceList: React.FC<TickerPerformanceListProps> = ({ 
  transactions, currentPrices, sectors, onTickerClick
}) => {
  const [analysisMode, setAnalysisMode] = useState<'STOCK' | 'SECTOR'>(() => {
      return (localStorage.getItem('psx_analyzer_mode') as 'STOCK' | 'SECTOR') || 'STOCK';
  });

  const [selectedTicker, setSelectedTicker] = useState<string | null>(() => {
      return localStorage.getItem('psx_last_analyzed_ticker') || null;
  });

  const [selectedSector, setSelectedSector] = useState<string | null>(() => {
      return localStorage.getItem('psx_last_analyzed_sector') || null;
  });
  
  const [searchTerm, setSearchTerm] = useState(() => {
      const mode = localStorage.getItem('psx_analyzer_mode') as 'STOCK' | 'SECTOR';
      if (mode === 'SECTOR') return localStorage.getItem('psx_last_analyzed_sector') || '';
      return localStorage.getItem('psx_last_analyzed_ticker') || '';
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [activityPage, setActivityPage] = useState<number>(1);
  const [activityRowsPerPage, setActivityRowsPerPage] = useState<number>(25);

  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [loadingFundamentals, setLoadingFundamentals] = useState(false);
  const [financialPeriod, setFinancialPeriod] = useState<'Annual' | 'Quarterly'>('Annual');

  const loadFundamentals = useCallback(async () => {
      if (analysisMode === 'STOCK' && selectedTicker) {
          setLoadingFundamentals(true);
          setFundamentals(null); 
          try {
              const data = await fetchCompanyFundamentals(selectedTicker);
              setFundamentals(data);
          } catch (err) {
              console.error("Failed to fetch fundamentals", err);
          } finally {
              setLoadingFundamentals(false);
          }
      } else {
          setFundamentals(null);
      }
  }, [selectedTicker, analysisMode]);

  useEffect(() => {
      loadFundamentals();
  }, [loadFundamentals]);

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

  const calculateEnrichedRows = (ticker: string, txs: Transaction[]): ActivityRow[] => {
      const currentPrice = currentPrices[ticker] || 0;
      const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
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

      return sortedTxs.map(t => {
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          let avgBuyPrice = 0; 
          let sellOrCurrentPrice = 0; 
          let gain = 0; 
          let gainType: 'REALIZED' | 'UNREALIZED' | 'NONE' = 'NONE'; 
          let remainingQty = 0;

          if (t.type === 'BUY') {
              avgBuyPrice = ((t.quantity * t.price) + fees) / t.quantity; 
              sellOrCurrentPrice = currentPrice; 
              remainingQty = buyRemainingMap[t.id] ?? 0;
              if (remainingQty < 0.001) remainingQty = 0;
              if (remainingQty > 0) { 
                  gain = (sellOrCurrentPrice - avgBuyPrice) * remainingQty; 
                  gainType = 'UNREALIZED'; 
              }
          } else if (t.type === 'SELL') {
              const analysis = sellAnalysisMap[t.id]; 
              if (analysis) { 
                  avgBuyPrice = analysis.avgBuy; 
                  sellOrCurrentPrice = ((t.quantity * t.price) - fees) / t.quantity; 
                  gain = analysis.gain; 
                  gainType = 'REALIZED'; 
              }
          } else if (t.type === 'DIVIDEND') { 
              avgBuyPrice = 0; 
              sellOrCurrentPrice = t.price; 
              gain = (t.quantity * t.price) - (t.tax || 0); 
              gainType = 'NONE'; 
          }
          return { ...t, avgBuyPrice, sellOrCurrentPrice, gain, gainType, remainingQty };
      }).reverse();
  };

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
          const txs = transactions.filter(t => t.ticker === ticker);
          const enrichedRows = calculateEnrichedRows(ticker, txs); 
          
          let ownedQty = 0; let soldQty = 0; let realizedPL = 0; let unrealizedPL = 0;
          let totalDividends = 0; let dividendTax = 0; let dividendCount = 0; let dividendSharesCount = 0;
          let totalComm = 0; let totalTradingTax = 0; let totalCDC = 0; let totalOther = 0;
          let tradeCount = 0; let buyCount = 0; let sellCount = 0; let lifetimeBuyCost = 0;
          let totalCostBasis = 0; 
          let aggBuyComm = 0; let aggBuyCDC = 0; let aggBuyOther = 0; let totalBuyVolume = 0;

          const activeBuys = enrichedRows.filter(r => r.type === 'BUY' && (r.remainingQty || 0) > 0);
          const oldestBuyDate = activeBuys.length > 0 ? activeBuys[activeBuys.length - 1].date : null;
          const holdingPeriod = oldestBuyDate ? getHoldingDuration(oldestBuyDate) : '-';

          enrichedRows.forEach(row => {
              if (row.type === 'BUY') {
                  lifetimeBuyCost += (row.quantity * row.avgBuyPrice); 
                  if (row.gainType === 'UNREALIZED') unrealizedPL += row.gain;
                  if ((row.remainingQty || 0) > 0) {
                      totalCostBasis += (row.remainingQty || 0) * row.avgBuyPrice;
                  }
                  tradeCount++; buyCount++;
                  totalComm += row.commission || 0; 
                  totalTradingTax += row.tax || 0; 
                  totalCDC += row.cdcCharges || 0; 
                  totalOther += row.otherFees || 0;
                  aggBuyComm += row.commission || 0;
                  aggBuyCDC += row.cdcCharges || 0;
                  aggBuyOther += row.otherFees || 0;
                  totalBuyVolume += row.quantity;
              } else if (row.type === 'SELL') {
                  soldQty += row.quantity;
                  if (row.gainType === 'REALIZED') realizedPL += row.gain;
                  tradeCount++; sellCount++;
                  totalComm += row.commission || 0; totalTradingTax += row.tax || 0; totalCDC += row.cdcCharges || 0; totalOther += row.otherFees || 0;
              } else if (row.type === 'DIVIDEND') {
                  totalDividends += (row.quantity * row.price);
                  dividendTax += (row.tax || 0);
                  dividendCount++;
                  dividendSharesCount += row.quantity;
              }
          });

          ownedQty = enrichedRows.filter(r => r.type === 'BUY').reduce((acc, r) => acc + (r.remainingQty || 0), 0);
          const currentPrice = currentPrices[ticker] || 0;
          const currentValue = ownedQty * currentPrice;
          const currentAvgPrice = ownedQty > 0 ? totalCostBasis / ownedQty : 0;
          const totalNetReturn = realizedPL + unrealizedPL + (totalDividends - dividendTax);
          const lifetimeROI = lifetimeBuyCost > 0 ? (totalNetReturn / lifetimeBuyCost) * 100 : 0;
          const feesPaid = totalComm + totalTradingTax + totalCDC + totalOther;
          const allocationPercent = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
          
          let breakEvenPrice = 0;
          if (totalBuyVolume > 0) {
              const avgBuyCommPerShare = aggBuyComm / totalBuyVolume;
              const avgBuyCDCPerShare = aggBuyCDC / totalBuyVolume;
              const avgBuyOtherPerShare = aggBuyOther / totalBuyVolume;
              const estSellTaxPerShare = avgBuyCommPerShare * 0.15;
              const estSellFeePerShare = avgBuyCommPerShare + estSellTaxPerShare + avgBuyCDCPerShare + avgBuyOtherPerShare;
              breakEvenPrice = currentAvgPrice + estSellFeePerShare;
          }

          const dividendYieldOnCost = lifetimeBuyCost > 0 ? (totalDividends / lifetimeBuyCost) * 100 : 0;
          const avgDPS = dividendSharesCount > 0 ? totalDividends / dividendSharesCount : 0;

          return {
              ticker,
              sector: sectors[ticker] || 'Unknown',
              status: ownedQty > 0.01 ? 'Active' : 'Closed',
              ownedQty, soldQty, currentPrice, currentAvgPrice, currentValue,
              totalCostBasis, 
              realizedPL, unrealizedPL, totalNetReturn,
              totalDividends, dividendTax, netDividends: totalDividends - dividendTax,
              dividendCount, dividendSharesCount, dividendYieldOnCost, avgDPS,
              feesPaid, totalComm, totalTradingTax, totalCDC, totalOther,
              tradeCount, buyCount, sellCount,
              lifetimeROI, allocationPercent, breakEvenPrice,
              lifetimeBuyCost,
              holdingPeriod
          };
      }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [transactions, currentPrices, sectors, totalPortfolioValue]);

  const allSectorStats = useMemo(() => {
      const sectorMap: Record<string, SectorStats> = {};
      allTickerStats.forEach(stat => {
          const secName = stat.sector;
          if (!sectorMap[secName]) {
              sectorMap[secName] = {
                  name: secName, stockCount: 0, totalCostBasis: 0, currentValue: 0, realizedPL: 0, unrealizedPL: 0, totalDividends: 0, netDividends: 0, dividendTax: 0, lifetimeNet: 0, lifetimeROI: 0, allocationPercent: 0, feesPaid: 0, totalComm: 0, totalTradingTax: 0, totalCDC: 0, totalOther: 0, tradeCount: 0, buyCount: 0, sellCount: 0, dividendYieldOnCost: 0, ownedQty: 0, soldQty: 0, dividendCount: 0, tickers: []
              };
          }
          const s = sectorMap[secName];
          s.stockCount++; s.totalCostBasis += stat.totalCostBasis; s.currentValue += stat.currentValue; s.realizedPL += stat.realizedPL; s.unrealizedPL += stat.unrealizedPL; s.totalDividends += stat.totalDividends; s.netDividends += stat.netDividends; s.dividendTax += stat.dividendTax; s.feesPaid += stat.feesPaid; s.totalComm += stat.totalComm; s.totalTradingTax += stat.totalTradingTax; s.totalCDC += stat.totalCDC; s.totalOther += stat.totalOther; s.tradeCount += stat.tradeCount; s.buyCount += stat.buyCount; s.sellCount += stat.sellCount; s.allocationPercent += stat.allocationPercent; s.lifetimeNet += stat.totalNetReturn; s.ownedQty += stat.ownedQty; s.soldQty += stat.soldQty; s.dividendCount += stat.dividendCount; s.tickers.push(stat.ticker);
      });
      const sectorArray = Object.values(sectorMap);
      sectorArray.forEach(sec => {
          const totalInvestedInSector = allTickerStats.filter(t => t.sector === sec.name).reduce((sum, t) => sum + t.lifetimeBuyCost, 0);
          sec.lifetimeROI = totalInvestedInSector > 0 ? (sec.lifetimeNet / totalInvestedInSector) * 100 : 0;
          sec.dividendYieldOnCost = totalInvestedInSector > 0 ? (sec.totalDividends / totalInvestedInSector) * 100 : 0;
      });
      return sectorArray.sort((a, b) => b.allocationPercent - a.allocationPercent);
  }, [allTickerStats]);

  const filteredOptions = useMemo(() => {
      if (analysisMode === 'STOCK') {
          if (!searchTerm) return allTickerStats;
          return allTickerStats.filter(s => s.ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      } else {
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

  useEffect(() => { setActivityPage(1); }, [selectedTicker, selectedSector]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchToStockMode = () => { setAnalysisMode('STOCK'); localStorage.setItem('psx_analyzer_mode', 'STOCK'); const lastTicker = localStorage.getItem('psx_last_analyzed_ticker'); setSearchTerm(lastTicker || ''); setIsDropdownOpen(false); };
  const switchToSectorMode = () => { setAnalysisMode('SECTOR'); localStorage.setItem('psx_analyzer_mode', 'SECTOR'); const lastSector = localStorage.getItem('psx_last_analyzed_sector'); setSearchTerm(lastSector || ''); setIsDropdownOpen(false); };
  const handleSelect = (val: string) => { if (analysisMode === 'STOCK') { setSelectedTicker(val); localStorage.setItem('psx_last_analyzed_ticker', val); } else { setSelectedSector(val); localStorage.setItem('psx_last_analyzed_sector', val); } setSearchTerm(val); setIsDropdownOpen(false); };
  const handleClearSelection = (e: React.MouseEvent) => { e.stopPropagation(); setSearchTerm(''); if (analysisMode === 'STOCK') { setSelectedTicker(null); localStorage.removeItem('psx_last_analyzed_ticker'); } else { setSelectedSector(null); localStorage.removeItem('psx_last_analyzed_sector'); } };

  const activityRows = useMemo(() => { if (!selectedTicker || analysisMode !== 'STOCK') return []; const txs = transactions.filter(t => t.ticker === selectedTicker); return calculateEnrichedRows(selectedTicker, txs); }, [selectedTicker, transactions, currentPrices, analysisMode]);
  const sectorActivityRows = useMemo(() => { if (!selectedSector || analysisMode !== 'SECTOR' || !selectedSectorStats) return []; const allRows: ActivityRow[] = []; selectedSectorStats.tickers.forEach(ticker => { const txs = transactions.filter(t => t.ticker === ticker); const enriched = calculateEnrichedRows(ticker, txs); allRows.push(...enriched); }); return allRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); }, [selectedSector, transactions, analysisMode, selectedSectorStats, currentPrices]);
  const currentRows = analysisMode === 'STOCK' ? activityRows : sectorActivityRows;
  const paginatedActivity = useMemo(() => { const start = (activityPage - 1) * activityRowsPerPage; return currentRows.slice(start, start + activityRowsPerPage); }, [currentRows, activityPage, activityRowsPerPage]);
  const totalActivityPages = Math.ceil(currentRows.length / activityRowsPerPage);
  const activityTotals = useMemo(() => { return currentRows.reduce((acc, row) => { let net = 0; const gross = row.quantity * row.price; const fees = (row.commission || 0) + (row.tax || 0) + (row.cdcCharges || 0) + (row.otherFees || 0); if (row.type === 'BUY') net = -(gross + fees); else if (row.type === 'SELL') net = gross - fees; else if (row.type === 'DIVIDEND') net = gross - (row.tax || 0); return { netAmount: acc.netAmount + net, realized: acc.realized + (row.gainType === 'REALIZED' ? row.gain : 0), unrealized: acc.unrealized + (row.gainType === 'UNREALIZED' ? row.gain : 0) }; }, { netAmount: 0, realized: 0, unrealized: 0 }); }, [currentRows]);

  const handleExportActivity = () => { if (analysisMode === 'STOCK' && selectedTicker) { const dataToExport = activityRows.map(row => ({ Date: row.date, Type: row.type, Qty: row.quantity, Price: row.price, 'Avg Buy / Cost': row.avgBuyPrice, 'Sell / Current': row.sellOrCurrentPrice, 'Gain/Loss': row.gain, 'Gain Type': row.gainType })); exportToCSV(dataToExport, `${selectedTicker}_Activity_Log`); } else if (analysisMode === 'SECTOR' && selectedSector) { const dataToExport = sectorActivityRows.map(row => ({ Date: row.date, Ticker: row.ticker, Type: row.type, Qty: row.quantity, Price: row.price, 'Avg Buy': row.avgBuyPrice, 'Sell/Current': row.sellOrCurrentPrice, 'Gain': row.gain })); exportToCSV(dataToExport, `${selectedSector}_Sector_Activity`); } };
  const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDecimal = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const displayFinancials = useMemo(() => {
      if (!fundamentals) return null;
      return financialPeriod === 'Annual' ? fundamentals.annual : fundamentals.quarterly;
  }, [fundamentals, financialPeriod]);

  return (
    <div className="max-w-7xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER SECTION with TOGGLE */}
      <div className="relative z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/40 mb-8 flex flex-col items-center justify-center text-center">
          
          <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-2">
                  {analysisMode === 'STOCK' ? 'Stock Analyzer' : 'Sector Analyzer'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {analysisMode === 'STOCK' 
                      ? 'Select a company to view position details, realized gains, and activity.'
                      : 'Select a sector to view aggregated performance across multiple companies.'}
              </p>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 shadow-inner border border-slate-200 dark:border-slate-700">
              <button onClick={switchToStockMode} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${analysisMode === 'STOCK' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}> <LayoutList size={16} /> Stock </button>
              <button onClick={switchToSectorMode} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${analysisMode === 'SECTOR' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}> <Layers size={16} /> Sector </button>
          </div>

          <div className="relative w-full max-w-md" ref={dropdownRef}>
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all cursor-text" onClick={() => setIsDropdownOpen(true)}>
                  <Search size={20} className="text-slate-400 mr-3" />
                  <input type="text" className="flex-1 bg-transparent outline-none text-slate-800 dark:text-slate-200 font-bold placeholder:font-normal" placeholder={analysisMode === 'STOCK' ? "Search Ticker (e.g. PPL)..." : "Search Sector (e.g. Fertilizer)..."} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value.toUpperCase()); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} />
                  {(selectedTicker || selectedSector) && ( <button onClick={handleClearSelection} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 mr-1"> <XCircle size={16} /> </button> )}
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                      {filteredOptions.length === 0 ? ( <div className="p-4 text-center text-slate-400 text-sm">No results found.</div> ) : ( filteredOptions.map((stats: any) => ( <div key={analysisMode === 'STOCK' ? stats.ticker : stats.name} onClick={() => handleSelect(analysisMode === 'STOCK' ? stats.ticker : stats.name)} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl cursor-pointer group transition-colors"> <div className="flex items-center gap-3"> <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black ${analysisMode === 'STOCK' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}> {analysisMode === 'STOCK' ? stats.ticker.substring(0, 2) : <Layers size={16} />} </div> <div className="text-left"> <div className="font-bold text-slate-800 dark:text-slate-200">{analysisMode === 'STOCK' ? stats.ticker : stats.name}</div> <div className="text-[10px] text-slate-400 uppercase font-medium"> {analysisMode === 'STOCK' ? stats.sector : `${stats.stockCount} Companies`} </div> </div> </div> <div className="text-right"> <div className={`font-bold text-sm ${analysisMode === 'STOCK' ? (stats.totalNetReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400') : (stats.lifetimeNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400')}`}> {analysisMode === 'STOCK' ? (stats.totalNetReturn >= 0 ? '+' : '') + formatCurrency(stats.totalNetReturn) : (stats.lifetimeNet >= 0 ? '+' : '') + formatCurrency(stats.lifetimeNet) } </div> </div> </div> )) )}
                  </div>
              )}
          </div>
      </div>

      <div className="relative z-10">
        
        {/* --- STOCK DASHBOARD --- */}
        {analysisMode === 'STOCK' && selectedStockStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* 1. HEADER */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner ${selectedStockStats.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}> {selectedStockStats.ticker.substring(0, 1)} </div>
                        <div> <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{selectedStockStats.ticker}</h1> <div className="flex items-center gap-2 mt-1"> <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-bold uppercase border border-slate-200 dark:border-slate-600">{selectedStockStats.sector}</span> <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${selectedStockStats.status === 'Active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}> {selectedStockStats.status} </span> </div> </div>
                    </div>
                </div>

                {/* 1.5 QUICK STATS BAR */}
                <div className={`grid grid-cols-2 ${selectedStockStats.status === 'Active' ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-3'} gap-4`}>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl"><Activity size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Price</div> <div className="text-lg font-black text-slate-800 dark:text-slate-100">Rs. {formatDecimal(selectedStockStats.currentPrice)}</div> </div> </div> </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`p-2 rounded-xl ${selectedStockStats.totalNetReturn >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}><TrendingUp size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lifetime Net</div> <div className={`text-lg font-black ${selectedStockStats.totalNetReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedStockStats.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.totalNetReturn)} </div> </div> </div> </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`p-2 rounded-xl ${selectedStockStats.lifetimeROI >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}><Percent size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lifetime ROI</div> <div className={`text-lg font-black ${selectedStockStats.lifetimeROI >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedStockStats.lifetimeROI >= 0 ? '+' : ''}{formatDecimal(selectedStockStats.lifetimeROI)}% </div> </div> </div> </div>
                    {selectedStockStats.status === 'Active' && ( <> <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-xl"><PieChart size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Allocation</div> <div className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedStockStats.allocationPercent.toFixed(1)}%</div> </div> </div> </div> <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="p-2 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-xl"><Target size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Break-Even Price</div> <div className="text-lg font-black text-violet-600 dark:text-violet-400">Rs. {formatDecimal(selectedStockStats.breakEvenPrice)}</div> </div> </div> </div> </> )}
                </div>

                {/* 2. STATS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg"><Wallet size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Position & Gains</h3> </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4"> 
                                <div> 
                                    <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{selectedStockStats.ownedQty.toLocaleString()}</div> 
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Owned Shares</div> 
                                    {selectedStockStats.holdingPeriod !== '-' && (
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded w-fit" title="Duration of oldest unsold shares">
                                            <Clock size={10} />
                                            <span>Oldest: {selectedStockStats.holdingPeriod}</span>
                                        </div>
                                    )}
                                </div> 
                                <div> 
                                    <div className="text-3xl font-bold text-slate-400 dark:text-slate-500">{selectedStockStats.soldQty.toLocaleString()}</div> 
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Sold Shares</div> 
                                </div> 
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                            <div className="grid grid-cols-2 gap-4"> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Rs. {formatCurrency(selectedStockStats.totalCostBasis)}</div> <div className="text-[10px] text-slate-400">Total Cost Basis</div> <div className="text-[9px] text-slate-400 mt-0.5"> Avg: <span className="font-mono text-slate-600 dark:text-slate-300">Rs. {formatDecimal(selectedStockStats.currentAvgPrice)}</span> </div> </div> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Rs. {formatCurrency(selectedStockStats.currentValue)}</div> <div className="text-[10px] text-slate-400">Market Value</div> </div> </div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"> <div> <div className={`text-sm font-bold ${selectedStockStats.realizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedStockStats.realizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.realizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Realized Gains</div> </div> <div> <div className={`text-sm font-bold ${selectedStockStats.unrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedStockStats.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(selectedStockStats.unrealizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Unrealized Gains</div> </div> </div>
                        </div>
                    </Card>
                    
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg"><Coins size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Passive Income</h3> </div>
                        <div className="space-y-6">
                             <div> <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">+{formatCurrency(selectedStockStats.netDividends)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Net Dividends (After Tax)</div> </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                             <div className="flex justify-between items-center"> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(selectedStockStats.totalDividends)}</div> <div className="text-[10px] text-slate-400">Gross Dividends</div> </div> <div className="text-right"> <div className="text-sm font-bold text-rose-500 dark:text-rose-400">-{formatCurrency(selectedStockStats.dividendTax)}</div> <div className="text-[10px] text-slate-400">Tax Paid</div> </div> </div>
                             <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl p-3 border border-indigo-100 dark:border-indigo-800 flex justify-between items-center"> <div> <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold"> <Percent size={14} /> <span>{selectedStockStats.dividendYieldOnCost.toFixed(2)}%</span> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Yield on Cost</div> </div> <div className="h-6 w-px bg-indigo-200/50 dark:bg-indigo-700"></div> <div className="text-right"> <div className="flex items-center justify-end gap-1.5 text-slate-700 dark:text-slate-300 font-bold"> <span>{selectedStockStats.dividendCount}</span> <CalendarCheck size={14} className="text-slate-400" /> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Payouts Received</div> </div> </div>
                             <div className="flex gap-1 h-12 items-end mt-2 opacity-80"> {[30, 45, 25, 60, 40, 70, 50].map((h, i) => ( <div key={i} className="flex-1 bg-indigo-100 dark:bg-indigo-800 rounded-t-sm" style={{ height: `${h}%` }}></div> ))} </div>
                        </div>
                    </Card>

                     <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg"><Receipt size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Costs & Fees</h3> </div>
                        <div className="space-y-6">
                             <div className="space-y-2">
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Commission</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedStockStats.totalComm)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Trading Tax</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedStockStats.totalTradingTax)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">CDC Charges</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedStockStats.totalCDC)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Other Fees</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedStockStats.totalOther)}</span> </div>
                             </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                             <div> <div className="text-2xl font-bold text-rose-500 dark:text-rose-400">-{formatCurrency(selectedStockStats.feesPaid)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Total Charges</div> </div>
                             <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                                 <div className="flex justify-between items-center mb-1"> <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Trades Executed</span> <span className="text-lg font-black text-slate-800 dark:text-slate-200">{selectedStockStats.tradeCount}</span> </div>
                                 <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 border-t border-slate-200 dark:border-slate-700 pt-1"> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> <span>{selectedStockStats.buyCount} Buys</span> </div> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> <span>{selectedStockStats.sellCount} Sells</span> </div> </div>
                             </div>
                        </div>
                    </Card>
                </div>

                {/* --- COMPANY FINANCIALS --- */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText size={20} className="text-slate-500 dark:text-slate-400" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-200">Company Financials</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                <button onClick={() => setFinancialPeriod('Annual')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${financialPeriod === 'Annual' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Annual</button>
                                <button onClick={() => setFinancialPeriod('Quarterly')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${financialPeriod === 'Quarterly' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Quarterly</button>
                            </div>
                            <button onClick={loadFundamentals} disabled={loadingFundamentals} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"> <RefreshCw size={16} className={loadingFundamentals ? "animate-spin" : ""} /> </button>
                        </div>
                    </div>
                    
                    {!displayFinancials && !loadingFundamentals && ( <div className="p-8 text-center text-slate-400 text-sm">No {financialPeriod.toLowerCase()} data available for this company.</div> )}

                    {displayFinancials && (
                        <div className="p-6 space-y-8 animate-in fade-in">
                            {displayFinancials.financials.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">{financialPeriod} Results (000's)</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                                            <thead className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                                                <tr> <th className="px-4 py-3"></th> {displayFinancials.financials.map(f => ( <th key={f.year} className="px-4 py-3 text-right">{f.year}</th> ))} </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                <tr> <td className="px-4 py-3 font-bold">Sales</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-4 py-3 text-right tabular-nums">{f.sales}</td>)} </tr>
                                                <tr> <td className="px-4 py-3 font-bold">Total Income</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-4 py-3 text-right tabular-nums">{f.totalIncome}</td>)} </tr>
                                                <tr> <td className="px-4 py-3 font-bold">Profit After Tax</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{f.profitAfterTax}</td>)} </tr>
                                                <tr> <td className="px-4 py-3 font-bold">EPS</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-4 py-3 text-right tabular-nums font-bold text-indigo-600 dark:text-indigo-400">{f.eps}</td>)} </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {displayFinancials.ratios.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Key Ratios</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                                            <thead className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                                                <tr> <th className="px-4 py-3"></th> {displayFinancials.ratios.map(r => ( <th key={r.year} className="px-4 py-3 text-right">{r.year}</th> ))} </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                <tr> <td className="px-4 py-3 font-bold">Net Profit Margin (%)</td> {displayFinancials.ratios.map(r => <td key={r.year} className="px-4 py-3 text-right tabular-nums">{r.netProfitMargin}</td>)} </tr>
                                                <tr> <td className="px-4 py-3 font-bold">EPS Growth (%)</td> {displayFinancials.ratios.map(r => <td key={r.year} className={`px-4 py-3 text-right tabular-nums ${r.epsGrowth.includes('(') ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{r.epsGrowth}</td>)} </tr>
                                                <tr> <td className="px-4 py-3 font-bold">PEG</td> {displayFinancials.ratios.map(r => <td key={r.year} className="px-4 py-3 text-right tabular-nums">{r.peg}</td>)} </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ACTIVITY TABLE */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-700/30">
                        <div className="flex items-center gap-2"> <History size={20} className="text-slate-500 dark:text-slate-400" /> <h3 className="font-bold text-slate-800 dark:text-slate-200">All Time Activity</h3> </div>
                        <button onClick={handleExportActivity} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"> <Download size={14} /> Export CSV </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-slate-700/50 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider border-b border-slate-200 dark:border-slate-700">
                                <tr> <th className="px-6 py-4">Date</th> <th className="px-4 py-4">Type</th> <th className="px-4 py-4 text-right">Qty</th> <th className="px-4 py-4 text-center">Held</th> <th className="px-4 py-4 text-right text-slate-700 dark:text-slate-300" title="Effective Buy Rate or Cost Basis">Avg Buy Price</th> <th className="px-4 py-4 text-right text-slate-700 dark:text-slate-300" title="Effective Sell Rate or Current Market Price">Sell / Current</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Comm</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Tax</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">CDC</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Other</th> <th className="px-6 py-4 text-right">Net Amount</th> <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10">Realized Gain</th> <th className="px-6 py-4 text-right text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">Unrealized Gain</th> </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {paginatedActivity.map(t => {
                                    const net = t.type === 'BUY' ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : t.type === 'SELL' ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : (t.quantity * t.price) - (t.tax||0); 
                                    let rowDuration = '-'; if (t.type === 'BUY' && (t.remainingQty || 0) > 0) { rowDuration = getHoldingDuration(t.date); }
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors group">
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{t.date}</td>
                                            <td className="px-4 py-4"><span className={`text-[10px] font-bold px-2 py-1 rounded border ${t.type === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' : t.type === 'SELL' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : t.type === 'DIVIDEND' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800' : 'bg-slate-100 dark:bg-slate-700'}`}>{t.type}</span></td>
                                            <td className="px-4 py-4 text-right text-slate-700 dark:text-slate-300 font-medium">{t.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-4 text-center"> {rowDuration !== '-' ? ( <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded"> {rowDuration} </span> ) : ( <span className="text-slate-300 dark:text-slate-600 text-xs">-</span> )} </td>
                                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-600 dark:text-slate-400">{t.type === 'DIVIDEND' ? '-' : formatDecimal(t.avgBuyPrice)}</td>
                                            <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${t.type === 'SELL' ? 'text-emerald-600 dark:text-emerald-400' : t.type === 'BUY' ? 'text-rose-500 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{formatDecimal(t.sellOrCurrentPrice)}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.commission || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.tax || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.cdcCharges || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.otherFees || 0).toLocaleString()}</td>
                                            <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{formatCurrency(net)}</td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-emerald-50/30 dark:bg-emerald-900/10 ${t.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{t.gainType === 'REALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} </> ) : '-'}</td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-blue-50/30 dark:bg-blue-900/10 ${t.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{t.gainType === 'UNREALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} {t.remainingQty && t.remainingQty < t.quantity && ( <span className="block text-[8px] opacity-60 font-sans font-normal text-slate-500 dark:text-slate-400 mt-0.5"> (On {t.remainingQty.toLocaleString()}) </span> )} </> ) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-700/50 text-xs font-bold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700">
                                <tr> <td colSpan={10} className="px-6 py-3 text-right uppercase tracking-wider text-slate-500 dark:text-slate-400">Grand Total (Visible)</td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.netAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.netAmount >= 0 ? '+' : ''}{formatCurrency(activityTotals.netAmount)} </td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.realized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.realized >= 0 ? '+' : ''}{formatCurrency(activityTotals.realized)} </td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.unrealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.unrealized >= 0 ? '+' : ''}{formatCurrency(activityTotals.unrealized)} </td> </tr>
                            </tfoot>
                        </table>
                    </div>
                    {activityRows.length > 0 && (
                        <div className="p-4 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-2"> <span className="text-xs text-slate-500 dark:text-slate-400">Rows per page:</span> <select value={activityRowsPerPage} onChange={(e) => { setActivityRowsPerPage(Number(e.target.value)); setActivityPage(1); }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs py-1 px-2 outline-none focus:border-emerald-500 cursor-pointer text-slate-700 dark:text-slate-300" > <option value={25}>25</option> <option value={50}>50</option> <option value={100}>100</option> <option value={500}>500</option> <option value={1000}>1000</option> </select> </div>
                            <div className="flex items-center gap-4"> <span className="text-xs text-slate-500 dark:text-slate-400"> {(activityPage - 1) * activityRowsPerPage + 1}-{Math.min(activityPage * activityRowsPerPage, activityRows.length)} of {activityRows.length} </span> <div className="flex gap-1"> <button onClick={() => setActivityPage(p => Math.max(1, p - 1))} disabled={activityPage === 1} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-400" > <ChevronLeft size={16} /> </button> <button onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))} disabled={activityPage === totalActivityPages || totalActivityPages === 0} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-400" > <ChevronRight size={16} /> </button> </div> </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- SECTOR DASHBOARD --- */}
        {analysisMode === 'SECTOR' && selectedSectorStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* SECTOR HEADER */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner bg-blue-500 text-white"> <Layers size={32} /> </div>
                        <div> <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{selectedSectorStats.name}</h1> <div className="flex items-center gap-2 mt-1"> <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-0.5 rounded text-xs font-bold uppercase border border-slate-200 dark:border-slate-600"> {selectedSectorStats.stockCount} Companies </span> </div> </div>
                    </div>
                </div>

                {/* SECTOR QUICK STATS */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl"><Wallet size={18} /></div>
                            <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Value</div> <div className="text-lg font-black text-slate-800 dark:text-slate-100">Rs. {formatCurrency(selectedSectorStats.currentValue)}</div> </div>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${selectedSectorStats.lifetimeNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}><TrendingUp size={18} /></div>
                            <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sector Net P&L</div> <div className={`text-lg font-black ${selectedSectorStats.lifetimeNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedSectorStats.lifetimeNet >= 0 ? '+' : ''}{formatCurrency(selectedSectorStats.lifetimeNet)} </div> </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${selectedSectorStats.lifetimeROI >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}> <Percent size={18} /> </div>
                            <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lifetime ROI</div> <div className={`text-lg font-black ${selectedSectorStats.lifetimeROI >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedSectorStats.lifetimeROI >= 0 ? '+' : ''}{selectedSectorStats.lifetimeROI.toFixed(2)}% </div> </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl"><Coins size={18} /></div>
                            <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dividends</div> <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">+{formatCurrency(selectedSectorStats.netDividends)}</div> </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-xl"><PieChart size={18} /></div>
                            <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Allocation</div> <div className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedSectorStats.allocationPercent.toFixed(1)}%</div> </div>
                        </div>
                    </div>
                </div>

                {/* SECTOR DETAILED CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg"><Wallet size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Position & Gains</h3> </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4"> 
                                <div> <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{selectedSectorStats.ownedQty.toLocaleString()}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Owned Shares</div> </div> 
                                <div> <div className="text-3xl font-bold text-slate-400 dark:text-slate-500">{selectedSectorStats.soldQty.toLocaleString()}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Sold Shares</div> </div> 
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                            <div className="grid grid-cols-2 gap-4"> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Rs. {formatCurrency(selectedSectorStats.totalCostBasis)}</div> <div className="text-[10px] text-slate-400">Total Cost Basis</div> </div> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Rs. {formatCurrency(selectedSectorStats.currentValue)}</div> <div className="text-[10px] text-slate-400">Market Value</div> </div> </div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"> <div> <div className={`text-sm font-bold ${selectedSectorStats.realizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedSectorStats.realizedPL >= 0 ? '+' : ''}{formatCurrency(selectedSectorStats.realizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Realized Gains</div> </div> <div> <div className={`text-sm font-bold ${selectedSectorStats.unrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {selectedSectorStats.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(selectedSectorStats.unrealizedPL)} </div> <div className="text-[10px] text-slate-400 uppercase">Unrealized Gains</div> </div> </div>
                        </div>
                    </Card>
                    
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg"><Coins size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sector Dividend Income</h3> </div>
                        <div className="space-y-6">
                             <div> <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">+{formatCurrency(selectedSectorStats.netDividends)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Net Dividends (After Tax)</div> </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                             <div className="flex justify-between items-center"> <div> <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatCurrency(selectedSectorStats.totalDividends)}</div> <div className="text-[10px] text-slate-400">Gross Dividends</div> </div> <div className="text-right"> <div className="text-sm font-bold text-rose-500 dark:text-rose-400">-{formatCurrency(selectedSectorStats.dividendTax)}</div> <div className="text-[10px] text-slate-400">Tax Paid</div> </div> </div>
                             <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl p-3 border border-indigo-100 dark:border-indigo-800 flex justify-between items-center"> <div> <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold"> <Percent size={14} /> <span>{selectedSectorStats.dividendYieldOnCost.toFixed(2)}%</span> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Yield on Cost</div> </div> <div className="h-6 w-px bg-indigo-200/50 dark:bg-indigo-700"></div> <div className="text-right"> <div className="flex items-center justify-end gap-1.5 text-slate-700 dark:text-slate-300 font-bold"> <span>{selectedSectorStats.dividendCount}</span> <CalendarCheck size={14} className="text-slate-400" /> </div> <div className="text-[9px] text-slate-400 uppercase mt-0.5">Payouts Received</div> </div> </div>
                             <div className="flex gap-1 h-12 items-end mt-2 opacity-80"> {[30, 45, 25, 60, 40, 70, 50].map((h, i) => ( <div key={i} className="flex-1 bg-indigo-100 dark:bg-indigo-800 rounded-t-sm" style={{ height: `${h}%` }}></div> ))} </div>
                        </div>
                    </Card>

                     <Card className="md:col-span-1">
                        <div className="flex items-center gap-2 mb-6"> <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg"><Receipt size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Costs & Fees</h3> </div>
                        <div className="space-y-6">
                             <div className="space-y-2">
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Commission</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedSectorStats.totalComm)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Trading Tax</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedSectorStats.totalTradingTax)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">CDC Charges</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedSectorStats.totalCDC)}</span> </div>
                                 <div className="flex justify-between items-center text-xs"> <span className="text-slate-500 dark:text-slate-400">Other Fees</span> <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(selectedSectorStats.totalOther)}</span> </div>
                             </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                             <div> <div className="text-2xl font-bold text-rose-500 dark:text-rose-400">-{formatCurrency(selectedSectorStats.feesPaid)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase">Total Charges</div> </div>
                             <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                                 <div className="flex justify-between items-center mb-1"> <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Trades Executed</span> <span className="text-lg font-black text-slate-800 dark:text-slate-200">{selectedSectorStats.tradeCount}</span> </div>
                                 <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 border-t border-slate-200 dark:border-slate-700 pt-1"> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> <span>{selectedSectorStats.buyCount} Buys</span> </div> <div className="flex items-center gap-1"> <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> <span>{selectedSectorStats.sellCount} Sells</span> </div> </div>
                             </div>
                        </div>
                    </Card>
                </div>

                {/* SECTOR COMPANIES LIST */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Companies in {selectedSectorStats.name}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-slate-700/50 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider border-b border-slate-200 dark:border-slate-700">
                                <tr> <th className="px-6 py-4">Ticker</th> <th className="px-4 py-4 text-right">Cost Basis</th> <th className="px-4 py-4 text-right">Value</th> <th className="px-4 py-4 text-right">P&L</th> <th className="px-4 py-4 text-right">Action</th> </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {allTickerStats.filter(t => t.sector === selectedSectorStats.name).map(t => (
                                    <tr key={t.ticker} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{t.ticker}</td>
                                        <td className="px-4 py-4 text-right text-slate-600 dark:text-slate-400">{formatCurrency(t.totalCostBasis)}</td>
                                        <td className="px-4 py-4 text-right text-slate-800 dark:text-slate-200 font-bold">{formatCurrency(t.currentValue)}</td>
                                        <td className={`px-4 py-4 text-right font-bold ${t.totalNetReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {t.totalNetReturn >= 0 ? '+' : ''}{formatCurrency(t.totalNetReturn)} </td>
                                        <td className="px-4 py-4 text-right"> <button onClick={() => { setAnalysisMode('STOCK'); localStorage.setItem('psx_analyzer_mode', 'STOCK'); setSelectedTicker(t.ticker); localStorage.setItem('psx_last_analyzed_ticker', t.ticker); setSearchTerm(t.ticker); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold"> View Details </button> </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* SECTOR ACTIVITY TABLE */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-700/30">
                        <div className="flex items-center gap-2"> <History size={20} className="text-slate-500 dark:text-slate-400" /> <h3 className="font-bold text-slate-800 dark:text-slate-200">Recent Activity in {selectedSectorStats.name}</h3> </div>
                        <button onClick={handleExportActivity} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"> <Download size={14} /> Export CSV </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-slate-700/50 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider border-b border-slate-200 dark:border-slate-700">
                                <tr> <th className="px-6 py-4">Date</th> <th className="px-4 py-4">Ticker</th> <th className="px-4 py-4">Type</th> <th className="px-4 py-4 text-right">Qty</th> <th className="px-4 py-4 text-right text-slate-700 dark:text-slate-300" title="Effective Buy Rate or Cost Basis">Avg Buy Price</th> <th className="px-4 py-4 text-right text-slate-700 dark:text-slate-300" title="Effective Sell Rate or Current Market Price">Sell / Current</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Comm</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Tax</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">CDC</th> <th className="px-4 py-4 text-right text-slate-400 dark:text-slate-500">Other</th> <th className="px-6 py-4 text-right">Net Amount</th> <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10">Realized Gain</th> <th className="px-6 py-4 text-right text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">Unrealized Gain</th> </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {paginatedActivity.map((t, i) => {
                                    const net = t.type === 'BUY' ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : t.type === 'SELL' ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : (t.quantity * t.price) - (t.tax||0); 
                                    return (
                                        <tr key={`${t.id}-${i}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{t.date}</td>
                                            <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-200">{t.ticker}</td>
                                            <td className="px-4 py-4"> <span className={`text-[10px] font-bold px-2 py-1 rounded border ${t.type === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' : t.type === 'SELL' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800'}`}>{t.type}</span> </td>
                                            <td className="px-4 py-4 text-right text-slate-700 dark:text-slate-300">{t.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-600 dark:text-slate-400">{t.type === 'DIVIDEND' ? '-' : formatDecimal(t.avgBuyPrice)}</td>
                                            <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${t.type === 'SELL' ? 'text-emerald-600 dark:text-emerald-400' : t.type === 'BUY' ? 'text-rose-500 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{formatDecimal(t.sellOrCurrentPrice)}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.commission || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.tax || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.cdcCharges || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">{(t.otherFees || 0).toLocaleString()}</td>
                                            <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}> {formatCurrency(net)} </td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-emerald-50/30 dark:bg-emerald-900/10 ${t.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{t.gainType === 'REALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} </> ) : '-'}</td>
                                            <td className={`px-6 py-4 text-right font-mono text-xs font-bold bg-blue-50/30 dark:bg-blue-900/10 ${t.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{t.gainType === 'UNREALIZED' ? ( <> {t.gain >= 0 ? '+' : ''}{formatCurrency(t.gain)} {t.remainingQty && t.remainingQty < t.quantity && ( <span className="block text-[8px] opacity-60 font-sans font-normal text-slate-500 dark:text-slate-400 mt-0.5"> (On {t.remainingQty.toLocaleString()}) </span> )} </> ) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-700/50 text-xs font-bold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700">
                                <tr> <td colSpan={10} className="px-6 py-3 text-right uppercase tracking-wider text-slate-500 dark:text-slate-400">Grand Total (Visible)</td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.netAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.netAmount >= 0 ? '+' : ''}{formatCurrency(activityTotals.netAmount)} </td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.realized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.realized >= 0 ? '+' : ''}{formatCurrency(activityTotals.realized)} </td> <td className={`px-6 py-3 text-right font-mono ${activityTotals.unrealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {activityTotals.unrealized >= 0 ? '+' : ''}{formatCurrency(activityTotals.unrealized)} </td> </tr>
                            </tfoot>
                        </table>
                    </div>
                    {paginatedActivity.length > 0 && (
                        <div className="p-4 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-2"> <span className="text-xs text-slate-500 dark:text-slate-400">Rows per page:</span> <select value={activityRowsPerPage} onChange={(e) => { setActivityRowsPerPage(Number(e.target.value)); setActivityPage(1); }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs py-1 px-2 outline-none focus:border-emerald-500 cursor-pointer text-slate-700 dark:text-slate-300"> <option value={25}>25</option> <option value={50}>50</option> <option value={100}>100</option> </select> </div>
                            <div className="flex items-center gap-4"> <span className="text-xs text-slate-500 dark:text-slate-400"> {(activityPage - 1) * activityRowsPerPage + 1}-{Math.min(activityPage * activityRowsPerPage, currentRows.length)} of {currentRows.length} </span> <div className="flex gap-1"> <button onClick={() => setActivityPage(p => Math.max(1, p - 1))} disabled={activityPage === 1} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-400"><ChevronLeft size={16} /></button> <button onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))} disabled={activityPage === totalActivityPages || totalActivityPages === 0} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-400"><ChevronRight size={16} /></button> </div> </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- EMPTY STATE --- */}
        {!selectedTicker && !selectedSector && (
            <div className="flex flex-col items-center justify-center py-20 opacity-50"> 
                <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-300 dark:text-slate-600"> 
                    <BarChart3 size={48} /> 
                </div> 
                <h3 className="text-xl font-bold text-slate-400 dark:text-slate-500">No {analysisMode === 'STOCK' ? 'Stock' : 'Sector'} Selected</h3> 
                <p className="text-slate-400 dark:text-slate-500">Use the search bar above to analyze performance.</p> 
            </div>
        )}
      </div>
    </div>
  );
};
