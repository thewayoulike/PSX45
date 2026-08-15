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
  Clock,
  AlertCircle
} from 'lucide-react';
import { Card } from './ui/Card';
import { exportToCSV } from '../utils/export';
import { fetchCompanyFundamentals, FundamentalsData } from '../services/financials';

// --- HYBRID FALLBACK: Static Lists ---
const FALLBACK_KMI30 = new Set([
  'ENGRO', 'FFC', 'HUBC', 'LUCK', 'MARI', 'MEBL', 'OGDC', 'POL', 'PPL', 'PSO', 'SYS', 'TRG', 
  'CHCC', 'DGKC', 'FCCL', 'INIL', 'ISL', 'PIOC', 'PRL', 'SEARL', 'AICL', 'ATLH', 'DAWH', 
  'EPCL', 'GLAXO', 'MTL', 'NML', 'PKGS', 'SAZEW', 'THALL', 'AVN', 'GWLC', 'NATF', 'PSMC', 'EFERT'
]);

const FALLBACK_KSE100 = new Set([
  ...Array.from(FALLBACK_KMI30), 
  'UBL', 'HBL', 'MCB', 'BAHL', 'FABL', 'BAFL', 'BOP', 'SCBPL', 'KEL', 'FFBL', 'FATIMA', 
  'INDU', 'HCAR', 'PAEL', 'AGP', 'MUREB', 'NESTLE', 'COLG', 'BATA', 'IGIHL', 'SHFA', 
  'FEROZ', 'GTYR', 'LOTCHEM', 'NRL', 'SNGP', 'SSGC', 'NBP', 'AKBL', 'SNBL', 'HMB', 
  'EFOODS', 'GATM', 'HINO', 'KAPCO', 'NCPL', 'NPL', 'PKPEL', 'RMPL', 'SHEL', 'SML', 
  'TGL', 'GGL', 'GHGL', 'ASTL', 'ASL', 'CSAP', 'MUGHAL', 'AGHA', 'AMPL', 'FLYNG', 
  'NCL', 'STJT', 'FML', 'GADT', 'ILP', 'KTML', 'CAPP', 'TATM', 'CPHL', 'DSIL'
]);

interface TickerPerformanceListProps {
  transactions: Transaction[];
  currentPrices: Record<string, number>;
  sectors: Record<string, string>;
  listedInMap?: Record<string, string>; // Pass the dynamic tags here
  onTickerClick: (ticker: string) => void;
  mode?: 'STOCK' | 'SECTOR';                 // drive Stock/Sector from the sidebar
  onModeChange?: (mode: 'STOCK' | 'SECTOR') => void; // keep sidebar highlight in sync
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
  transactions, currentPrices, sectors, listedInMap = {}, onTickerClick, mode, onModeChange
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
      const txsByDate: Record<string, Transaction[]> = {};
      txs.forEach(t => {
          if (!txsByDate[t.date]) txsByDate[t.date] = [];
          txsByDate[t.date].push(t);
      });

      const sortedDates = Object.keys(txsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const mainLots: { id: string, quantity: number, costPerShare: number }[] = [];
      const buyRemainingMap: Record<string, number> = {};
      const sellAnalysisMap: Record<string, { avgBuy: number, gain: number, gainType: 'REALIZED' | 'NONE' }> = {};

      sortedDates.forEach(date => {
          const dayTxs = txsByDate[date];
          const dayBuys = dayTxs.filter(t => t.type === 'BUY');
          const daySells = dayTxs.filter(t => t.type === 'SELL');

          const dayBuyLots = dayBuys.map(t => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              const effRate = ((t.quantity * t.price) + fees) / t.quantity;
              return { id: t.id, quantity: t.quantity, costPerShare: effRate };
          });

          daySells.forEach(sellTx => {
              const fees = (sellTx.commission || 0) + (sellTx.tax || 0) + (sellTx.cdcCharges || 0) + (sellTx.otherFees || 0);
              const netProceeds = (sellTx.quantity * sellTx.price) - fees;
              let qtyToFill = sellTx.quantity;
              let totalCostBasis = 0;

              if (dayBuyLots.length > 0) {
                  for (const buyLot of dayBuyLots) {
                      if (qtyToFill <= 0.0001) break;
                      if (buyLot.quantity > 0) {
                          const matched = Math.min(qtyToFill, buyLot.quantity);
                          totalCostBasis += matched * buyLot.costPerShare;
                          buyLot.quantity -= matched;
                          qtyToFill -= matched;
                          buyRemainingMap[buyLot.id] = buyLot.quantity; 
                      }
                  }
              }

              while (qtyToFill > 0.0001 && mainLots.length > 0) {
                  const historyLot = mainLots[0];
                  const matched = Math.min(qtyToFill, historyLot.quantity);
                  totalCostBasis += matched * historyLot.costPerShare;
                  historyLot.quantity -= matched;
                  qtyToFill -= matched;
                  buyRemainingMap[historyLot.id] = historyLot.quantity;
                  if (historyLot.quantity < 0.0001) mainLots.shift();
              }

              const filledQty = sellTx.quantity - qtyToFill;
              const avgBuy = filledQty > 0 ? totalCostBasis / filledQty : 0;
              const gain = netProceeds - totalCostBasis;
              sellAnalysisMap[sellTx.id] = { avgBuy, gain, gainType: filledQty > 0 ? 'REALIZED' : 'NONE' };
          });

          dayBuyLots.forEach(lot => {
              if (lot.quantity > 0.0001) {
                  mainLots.push({ id: lot.id, quantity: lot.quantity, costPerShare: lot.costPerShare });
                  buyRemainingMap[lot.id] = lot.quantity;
              } else if (buyRemainingMap[lot.id] === undefined) {
                  buyRemainingMap[lot.id] = 0; 
              }
          });
      });

      return txs.map(t => {
          let avgBuyPrice = 0;
          let sellOrCurrentPrice = 0;
          let gain = 0;
          let gainType: 'REALIZED' | 'UNREALIZED' | 'NONE' = 'NONE';
          let remainingQty = 0;
          const currentPrice = currentPrices[ticker] || 0;

          if (t.type === 'BUY') {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              avgBuyPrice = ((t.quantity * t.price) + fees) / t.quantity;
              sellOrCurrentPrice = currentPrice;
              remainingQty = buyRemainingMap[t.id] !== undefined ? buyRemainingMap[t.id] : t.quantity;
              if (remainingQty > 0.0001) {
                  gain = (sellOrCurrentPrice - avgBuyPrice) * remainingQty;
                  gainType = 'UNREALIZED';
              }
          } else if (t.type === 'SELL') {
              const analysis = sellAnalysisMap[t.id];
              if (analysis) {
                  avgBuyPrice = analysis.avgBuy;
                  const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
                  sellOrCurrentPrice = ((t.quantity * t.price) - fees) / t.quantity;
                  gain = analysis.gain;
                  gainType = analysis.gainType;
              }
          } else if (t.type === 'DIVIDEND') {
               sellOrCurrentPrice = t.price;
               gain = (t.quantity * t.price) - (t.tax || 0);
               gainType = 'NONE';
          }
          return { ...t, avgBuyPrice, sellOrCurrentPrice, gain, gainType, remainingQty };
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
          let totalHeldFees = 0; 

          const activeBuys = enrichedRows.filter(r => r.type === 'BUY' && (r.remainingQty || 0) > 0);
          const oldestBuyDate = activeBuys.length > 0 ? activeBuys[activeBuys.length - 1].date : null;
          const holdingPeriod = oldestBuyDate ? getHoldingDuration(oldestBuyDate) : '-';

          enrichedRows.forEach(row => {
              if (row.type === 'BUY') {
                  lifetimeBuyCost += (row.quantity * row.avgBuyPrice); 
                  if (row.gainType === 'UNREALIZED') unrealizedPL += row.gain;
                  
                  if ((row.remainingQty || 0) > 0) {
                      totalCostBasis += (row.remainingQty || 0) * row.avgBuyPrice;
                      const feePerShare = row.avgBuyPrice - row.price;
                      totalHeldFees += (row.remainingQty || 0) * feePerShare;
                  }

                  tradeCount++; buyCount++;
                  totalComm += row.commission || 0; 
                  totalTradingTax += row.tax || 0; 
                  totalCDC += row.cdcCharges || 0; 
                  totalOther += row.otherFees || 0;
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
          if (ownedQty > 0) {
              const avgBuyFeePerShare = totalHeldFees / ownedQty;
              breakEvenPrice = currentAvgPrice + avgBuyFeePerShare;
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

  const switchToStockMode = (ticker?: string) => {
      setAnalysisMode('STOCK');
      onModeChange?.('STOCK');
      localStorage.setItem('psx_analyzer_mode', 'STOCK');
      const targetTicker = ticker || localStorage.getItem('psx_last_analyzed_ticker') || '';
      if (targetTicker) {
          setSelectedTicker(targetTicker);
          localStorage.setItem('psx_last_analyzed_ticker', targetTicker);
      }
      setSearchTerm(targetTicker); 
      setIsDropdownOpen(false); 
  };

  const switchToSectorMode = () => { setAnalysisMode('SECTOR'); onModeChange?.('SECTOR'); localStorage.setItem('psx_analyzer_mode', 'SECTOR'); const lastSector = localStorage.getItem('psx_last_analyzed_sector'); setSearchTerm(lastSector || ''); setIsDropdownOpen(false); };

  // Let the sidebar (Profile → Stocks / Sector) drive the analysis mode.
  useEffect(() => {
      if (!mode || mode === analysisMode) return;
      if (mode === 'SECTOR') switchToSectorMode();
      else switchToStockMode();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
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

  const getColorClass = (val: number) => {
      if (Math.abs(val) < 0.01) return 'text-slate-500 dark:text-slate-400';
      return val > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';
  };

  const formatGain = (val: number) => {
      if (Math.abs(val) < 0.01) return '0.00';
      return `${val > 0 ? '+' : ''}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const displayFinancials = useMemo(() => {
      if (!fundamentals) return null;
      return financialPeriod === 'Annual' ? fundamentals.annual : fundamentals.quarterly;
  }, [fundamentals, financialPeriod]);

  const isSelectionNotFound = (analysisMode === 'STOCK' && selectedTicker && !selectedStockStats) || 
                              (analysisMode === 'SECTOR' && selectedSector && !selectedSectorStats);

  // --- DYNAMIC TAG GENERATION ---
  let tags: string[] = [];
  if (selectedStockStats) {
      const rawListedIn = listedInMap?.[selectedStockStats.ticker] || "";
      if (rawListedIn) {
          tags = rawListedIn.split(',').map(t => t.trim()).filter(t => t);
      } else {
          const cleanTicker = selectedStockStats.ticker.toUpperCase();
          if (FALLBACK_KMI30.has(cleanTicker)) tags.push('KMI30');
          if (FALLBACK_KSE100.has(cleanTicker)) tags.push('KSE100');
      }
  }

  return (
    <div className="max-w-[1600px] mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      
      {/* HEADER SECTION with TOGGLE */}
      <div className="relative z-30 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-8 shadow-card dark:shadow-card-dark flex flex-col items-center justify-center text-center">
          
          <div className="mb-6 max-w-xl">
              <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight mb-2">
                  {analysisMode === 'STOCK' ? 'Stock Analyzer' : 'Sector Analyzer'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                  {analysisMode === 'STOCK' 
                      ? 'Select a company to view position details, realized gains, and trade history.'
                      : 'Select a sector to view aggregated performance across multiple portfolio positions.'}
              </p>
          </div>

          <div className="relative w-full max-w-md" ref={dropdownRef}>
              <div className="flex items-center glass-input rounded-2xl px-4 py-3.5 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all cursor-text" onClick={() => setIsDropdownOpen(true)}>
                  <Search size={18} className="text-slate-400 mr-3 shrink-0" />
                  <input type="text" className="flex-1 bg-transparent outline-none text-slate-900 dark:text-slate-100 font-bold placeholder:font-medium placeholder:text-slate-400" placeholder={analysisMode === 'STOCK' ? "Search Ticker (e.g. PPL)..." : "Search Sector (e.g. Fertilizer)..."} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value.toUpperCase()); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} />
                  {(selectedTicker || selectedSector) && ( <button onClick={handleClearSelection} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 mr-1 transition-colors"> <XCircle size={18} /> </button> )}
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                      {filteredOptions.length === 0 ? ( <div className="p-4 text-center text-slate-400 font-medium text-sm">No results found.</div> ) : ( filteredOptions.map((stats: any) => ( <div key={analysisMode === 'STOCK' ? stats.ticker : stats.name} onClick={() => handleSelect(analysisMode === 'STOCK' ? stats.ticker : stats.name)} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer group transition-colors"> <div className="flex items-center gap-3"> <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${analysisMode === 'STOCK' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-blue-50 text-blue-600 border border-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'}`}> {analysisMode === 'STOCK' ? stats.ticker.substring(0, 2) : <Layers size={16} />} </div> <div className="text-left"> <div className="font-display font-black text-slate-900 dark:text-white">{analysisMode === 'STOCK' ? stats.ticker : stats.name}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest"> {analysisMode === 'STOCK' ? stats.sector : `${stats.stockCount} Companies`} </div> </div> </div> <div className="text-right"> <div className={`font-mono font-bold text-sm tabular-nums ${getColorClass(analysisMode === 'STOCK' ? stats.totalNetReturn : stats.lifetimeNet)}`}> {formatGain(analysisMode === 'STOCK' ? stats.totalNetReturn : stats.lifetimeNet)} </div> </div> </div> )) )}
                  </div>
              )}
          </div>
      </div>

      <div className="relative z-10">
        
        {/* --- STOCK DASHBOARD --- */}
        {analysisMode === 'STOCK' && selectedStockStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {/* 1. HEADER */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-display font-black shadow-inner shrink-0 ${selectedStockStats.status === 'Active' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}> 
                            {selectedStockStats.ticker.substring(0, 1)} 
                        </div>
                        <div className="flex flex-col"> 
                            <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">{selectedStockStats.ticker}</h1> 
                            
                            <div className="flex flex-col gap-2 mt-2">
                                {/* SECTOR & STATUS */}
                                <div className="flex items-center gap-2"> 
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border border-slate-200/60 dark:border-slate-700/60 shadow-sm">{selectedStockStats.sector}</span> 
                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border shadow-sm ${selectedStockStats.status === 'Active' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}> {selectedStockStats.status} </span> 
                                </div> 
                                
                                {/* --- DYNAMIC TAGS --- */}
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {tags.map((tag, i) => {
                                            let colorClass = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                                            if (tag.includes('KMI')) {
                                                colorClass = "bg-purple-50 text-purple-600 border-purple-200/60 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20";
                                            } else if (tag.includes('KSE')) {
                                                colorClass = "bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
                                            }
                                            return (
                                                <span 
                                                    key={`${tag}-${i}`} 
                                                    className={`text-[9px] leading-none px-2 py-1 rounded-md border font-bold uppercase tracking-wider shadow-sm ${colorClass}`}
                                                >
                                                    {tag}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>

                {/* 1.5 QUICK STATS BAR */}
                <div className={`grid grid-cols-2 ${selectedStockStats.status === 'Active' ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-3'} gap-4`}>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0"><Activity size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current Price</div> <div className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">Rs. {formatDecimal(selectedStockStats.currentPrice)}</div> </div> </div> </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 ${Math.abs(selectedStockStats.totalNetReturn) < 0.01 ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' : selectedStockStats.totalNetReturn > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}><TrendingUp size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Lifetime Net</div> <div className={`text-lg font-mono font-bold tabular-nums ${getColorClass(selectedStockStats.totalNetReturn)}`}> {formatGain(selectedStockStats.totalNetReturn)} </div> </div> </div> </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex items-center justify-between"> <div className="flex items-center gap-3"> <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 ${Math.abs(selectedStockStats.lifetimeROI) < 0.01 ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' : selectedStockStats.lifetimeROI > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}><Percent size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Lifetime ROI</div> <div className={`text-lg font-mono font-bold tabular-nums ${getColorClass(selectedStockStats.lifetimeROI)}`}> {Math.abs(selectedStockStats.lifetimeROI) < 0.01 ? '0.00' : `${selectedStockStats.lifetimeROI > 0 ? '+' : ''}${formatDecimal(selectedStockStats.lifetimeROI)}`}% </div> </div> </div> </div>
                    {selectedStockStats.status === 'Active' && ( <> <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="w-10 h-10 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center border border-sky-100 dark:border-sky-500/20 shadow-sm shrink-0"><PieChart size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Allocation</div> <div className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">{selectedStockStats.allocationPercent.toFixed(1)}%</div> </div> </div> </div> <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex items-center justify-between"> <div className="flex items-center gap-3"> <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-2xl flex items-center justify-center border border-violet-100 dark:border-violet-500/20 shadow-sm shrink-0"><Target size={18} /></div> <div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Break-Even</div> <div className="text-lg font-mono font-bold text-violet-600 dark:text-violet-400 tabular-nums">Rs. {formatDecimal(selectedStockStats.breakEvenPrice)}</div> </div> </div> </div> </> )}
                </div>

                {/* 2. STATS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6"> <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm shrink-0"><Wallet size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Position & Gains</h3> </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4"> 
                                <div> 
                                    <div className="text-3xl font-display font-black text-slate-900 dark:text-white tabular-nums">{selectedStockStats.ownedQty.toLocaleString()}</div> 
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Owned Shares</div> 
                                    {selectedStockStats.holdingPeriod !== '-' && (
                                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-500/20 w-fit" title="Duration of oldest unsold shares">
                                            <Clock size={12} />
                                            <span>Oldest: {selectedStockStats.holdingPeriod}</span>
                                        </div>
                                    )}
                                </div> 
                                <div> 
                                    <div className="text-3xl font-display font-black text-slate-400 dark:text-slate-500 tabular-nums">{selectedStockStats.soldQty.toLocaleString()}</div> 
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sold Shares</div> 
                                </div> 
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                            <div className="grid grid-cols-2 gap-4"> <div> <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {formatCurrency(selectedStockStats.totalCostBasis)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Cost Basis</div> <div className="text-[10px] text-slate-400 mt-1 font-bold"> Avg: <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">Rs. {formatDecimal(selectedStockStats.currentAvgPrice)}</span> </div> </div> <div> <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {formatCurrency(selectedStockStats.currentValue)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Market Value</div> </div> </div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60"> <div> <div className={`text-sm font-mono font-bold tabular-nums ${getColorClass(selectedStockStats.realizedPL)}`}> {formatGain(selectedStockStats.realizedPL)} </div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Realized Gains</div> </div> <div> <div className={`text-sm font-mono font-bold tabular-nums ${getColorClass(selectedStockStats.unrealizedPL)}`}> {formatGain(selectedStockStats.unrealizedPL)} </div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Unrealized Gains</div> </div> </div>
                        </div>
                    </Card>
                    
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6"> <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm shrink-0"><Coins size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Passive Income</h3> </div>
                        <div className="space-y-6">
                             <div> <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400 tabular-nums">+{formatCurrency(selectedStockStats.netDividends)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Net Dividends (After Tax)</div> </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                             <div className="flex justify-between items-center"> <div> <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(selectedStockStats.totalDividends)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gross Dividends</div> </div> <div className="text-right"> <div className="text-sm font-mono font-bold text-rose-500 dark:text-rose-400 tabular-nums">-{formatCurrency(selectedStockStats.dividendTax)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tax Paid</div> </div> </div>
                             <div className="bg-indigo-50/50 dark:bg-indigo-500/10 rounded-2xl p-3.5 border border-indigo-100 dark:border-indigo-500/20 flex justify-between items-center shadow-sm"> <div> <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-mono font-bold text-sm tabular-nums"> <Percent size={14} /> <span>{selectedStockStats.dividendYieldOnCost.toFixed(2)}%</span> </div> <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Yield on Cost</div> </div> <div className="h-6 w-px bg-indigo-200/60 dark:bg-indigo-700/60"></div> <div className="text-right"> <div className="flex items-center justify-end gap-1.5 text-slate-900 dark:text-slate-100 font-mono font-bold text-sm tabular-nums"> <span>{selectedStockStats.dividendCount}</span> <CalendarCheck size={14} className="text-slate-400" /> </div> <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Payouts Received</div> </div> </div>
                             <div className="flex gap-1.5 h-12 items-end mt-2 opacity-80"> {[30, 45, 25, 60, 40, 70, 50].map((h, i) => ( <div key={i} className="flex-1 bg-indigo-200 dark:bg-indigo-500/30 rounded-t-md transition-all hover:bg-indigo-500" style={{ height: `${h}%` }}></div> ))} </div>
                        </div>
                    </Card>

                     <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6"> <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center border border-amber-100 dark:border-amber-500/20 shadow-sm shrink-0"><Receipt size={18} /></div> <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Costs & Fees</h3> </div>
                        <div className="space-y-6">
                             <div className="space-y-2.5">
                                 <div className="flex justify-between items-center text-xs font-bold"> <span className="text-slate-500 dark:text-slate-400">Commission</span> <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(selectedStockStats.totalComm)}</span> </div>
                                 <div className="flex justify-between items-center text-xs font-bold"> <span className="text-slate-500 dark:text-slate-400">Trading Tax</span> <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(selectedStockStats.totalTradingTax)}</span> </div>
                                 <div className="flex justify-between items-center text-xs font-bold"> <span className="text-slate-500 dark:text-slate-400">CDC Charges</span> <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(selectedStockStats.totalCDC)}</span> </div>
                                 <div className="flex justify-between items-center text-xs font-bold"> <span className="text-slate-500 dark:text-slate-400">Other Fees</span> <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(selectedStockStats.totalOther)}</span> </div>
                             </div>
                             <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                             <div> <div className="text-2xl font-display font-black text-rose-500 dark:text-rose-400 tabular-nums">-{formatCurrency(selectedStockStats.feesPaid)}</div> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Total Charges</div> </div>
                             <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-700/60">
                                 <div className="flex justify-between items-center mb-1"> <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Trades Executed</span> <span className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">{selectedStockStats.tradeCount}</span> </div>
                                 <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mt-2 border-t border-slate-200 dark:border-slate-700 pt-2"> <div className="flex items-center gap-1.5"> <div className="w-2 h-2 rounded-full bg-emerald-500"></div> <span>{selectedStockStats.buyCount} Buys</span> </div> <div className="flex items-center gap-1.5"> <div className="w-2 h-2 rounded-full bg-rose-500"></div> <span>{selectedStockStats.sellCount} Sells</span> </div> </div>
                             </div>
                        </div>
                    </Card>
                </div>

                {/* --- COMPANY FINANCIALS --- */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
                    <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                              <FileText size={20} />
                            </div>
                            <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Company Financials</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                <button onClick={() => setFinancialPeriod('Annual')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${financialPeriod === 'Annual' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>Annual</button>
                                <button onClick={() => setFinancialPeriod('Quarterly')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${financialPeriod === 'Quarterly' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>Quarterly</button>
                            </div>
                            <button onClick={loadFundamentals} disabled={loadingFundamentals} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"> <RefreshCw size={16} className={loadingFundamentals ? "animate-spin" : ""} /> </button>
                        </div>
                    </div>
                    
                    {!displayFinancials && !loadingFundamentals && ( <div className="p-12 text-center text-slate-400 font-medium text-sm">No {financialPeriod.toLowerCase()} data available for this company.</div> )}

                    {displayFinancials && (
                        <div className="p-6 space-y-8 animate-in fade-in duration-300">
                            {displayFinancials.financials.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">{financialPeriod} Results (000's)</h4>
                                    <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                        <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                                <tr> <th className="px-5 py-3.5">Metric</th> {displayFinancials.financials.map(f => ( <th key={f.year} className="px-5 py-3.5 text-right">{f.year}</th> ))} </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">Sales</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">{f.sales}</td>)} </tr>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">Total Income</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">{f.totalIncome}</td>)} </tr>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">Profit After Tax</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{f.profitAfterTax}</td>)} </tr>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">EPS</td> {displayFinancials.financials.map(f => <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">{f.eps}</td>)} </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {displayFinancials.ratios.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Key Ratios</h4>
                                    <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                        <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                                <tr> <th className="px-5 py-3.5">Ratio</th> {displayFinancials.ratios.map(r => ( <th key={r.year} className="px-5 py-3.5 text-right">{r.year}</th> ))} </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">Net Profit Margin (%)</td> {displayFinancials.ratios.map(r => <td key={r.year} className="px-5 py-3.5 text-right font-mono tabular-nums">{r.netProfitMargin}</td>)} </tr>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">EPS Growth (%)</td> {displayFinancials.ratios.map(r => <td key={r.year} className={`px-5 py-3.5 text-right font-mono tabular-nums font-bold ${r.epsGrowth.includes('(') ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{r.epsGrowth}</td>)} </tr>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"> <td className="px-5 py-3.5 font-bold">PEG</td> {displayFinancials.ratios.map(r => <td key={r.year} className="px-5 py-3.5 text-right font-mono tabular-nums">{r.peg}</td>)} </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- SECTOR DASHBOARD --- */}
        {analysisMode === 'SECTOR' && selectedSectorStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {/* 1. HEADER */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner bg-blue-50 text-blue-600 border border-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                            <Layers size={32} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">{selectedSectorStats.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border border-slate-200/60 dark:border-slate-700/60">
                                    {selectedSectorStats.stockCount} Companies
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. STATS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Sector Overview */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm shrink-0"><PieChart size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sector Overview</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-3xl font-display font-black text-slate-900 dark:text-white tabular-nums">{selectedSectorStats.stockCount}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Active Stocks</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-display font-black text-slate-400 dark:text-slate-500 tabular-nums">{selectedSectorStats.allocationPercent.toFixed(1)}%</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Portfolio Alloc.</div>
                                </div>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {formatCurrency(selectedSectorStats.totalCostBasis)}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Invested</div>
                                </div>
                                <div>
                                    <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {formatCurrency(selectedSectorStats.currentValue)}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current Value</div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Sector Performance */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm shrink-0"><TrendingUp size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Performance</h3>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <div className={`text-3xl font-display font-black tabular-nums ${getColorClass(selectedSectorStats.lifetimeNet)}`}>
                                    {formatGain(selectedSectorStats.lifetimeNet)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Lifetime Net Return</div>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                                <div>
                                    <div className={`text-sm font-mono font-bold tabular-nums ${getColorClass(selectedSectorStats.realizedPL)}`}>
                                        {formatGain(selectedSectorStats.realizedPL)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Realized</div>
                                </div>
                                <div>
                                    <div className={`text-sm font-mono font-bold tabular-nums ${getColorClass(selectedSectorStats.unrealizedPL)}`}>
                                        {formatGain(selectedSectorStats.unrealizedPL)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Unrealized</div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Sector Income */}
                    <Card className="md:col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm shrink-0"><Coins size={18} /></div>
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Income & Fees</h3>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400 tabular-nums">+{formatCurrency(selectedSectorStats.netDividends)}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Net Dividends</div>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 w-full"></div>
                            <div>
                                <div className="text-xl font-display font-black text-rose-500 dark:text-rose-400 tabular-nums">-{formatCurrency(selectedSectorStats.feesPaid)}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Total Fees Paid</div>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>Yield on Cost:</span>
                                <span className="font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">{selectedSectorStats.dividendYieldOnCost.toFixed(2)}%</span>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* 3. HOLDINGS LIST FOR SECTOR */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark">
                    <div className="p-6 border-b border-slate-200/60 dark:border-slate-800">
                        <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Sector Holdings</h3>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm min-w-[900px] whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-left sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-widest">
                                <tr>
                                    <th className="px-6 py-3.5">Ticker</th>
                                    <th className="px-6 py-3.5 text-right">Qty</th>
                                    <th className="px-6 py-3.5 text-right">Avg Price</th>
                                    <th className="px-6 py-3.5 text-right">Current</th>
                                    <th className="px-6 py-3.5 text-right">Total Cost</th>
                                    <th className="px-6 py-3.5 text-right">Market Value</th>
                                    <th className="px-6 py-3.5 text-right">% of Sector</th>
                                    <th className="px-6 py-3.5 text-right">Total P&L</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {selectedSectorStats.tickers.map(ticker => {
                                    const stockStats = allTickerStats.find(s => s.ticker === ticker);
                                    if (!stockStats) return null;
                                    
                                    const percentOfSector = selectedSectorStats.currentValue > 0 
                                        ? (stockStats.currentValue / selectedSectorStats.currentValue) * 100 
                                        : 0;

                                    return (
                                        <tr 
                                            key={ticker} 
                                            className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group" 
                                            onClick={() => switchToStockMode(ticker)}
                                        >
                                            <td className="px-6 py-3.5 font-display font-black text-slate-900 dark:text-white flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-500/10 transition-colors">
                                                    {ticker.substring(0, 2)}
                                                </div>
                                                {ticker}
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{stockStats.ownedQty.toLocaleString()}</td>
                                            <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formatDecimal(stockStats.currentAvgPrice)}</td>
                                            <td className="px-6 py-3.5 text-right font-mono text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatDecimal(stockStats.currentPrice)}</td>
                                            <td className="px-6 py-3.5 text-right text-slate-500 dark:text-slate-400 font-mono text-xs tabular-nums">{formatCurrency(stockStats.totalCostBasis)}</td>
                                            <td className="px-6 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100 font-mono text-xs tabular-nums">{formatCurrency(stockStats.currentValue)}</td>
                                            <td className="px-6 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2.5">
                                                    <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 tabular-nums">{percentOfSector.toFixed(1)}%</span>
                                                    <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${Math.min(percentOfSector, 100)}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-right">
                                                <div className={`font-mono font-bold tabular-nums text-sm ${getColorClass(stockStats.totalNetReturn)}`}>
                                                    {formatGain(stockStats.totalNetReturn)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* --- ACTIVITY TABLE --- */}
        {(selectedTicker || selectedSector) && !isSelectionNotFound && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark mt-8">
                <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3"> 
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                        <History size={20} /> 
                      </div>
                      <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Activity Log</h3> 
                    </div>
                    <button onClick={handleExportActivity} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 px-4 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm hover:-translate-y-0.5"> <Download size={14} /> Export CSV </button>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap min-w-[1000px] border-collapse">
                        <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-widest border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                            <tr> 
                              <th className="px-6 py-3.5">Date</th> 
                              <th className="px-4 py-3.5">Ticker</th> 
                              <th className="px-4 py-3.5">Type</th> 
                              <th className="px-4 py-3.5 text-right">Qty</th> 
                              <th className="px-4 py-3.5 text-right text-slate-700 dark:text-slate-300" title="Effective Buy Rate or Cost Basis">Avg Buy Price</th> 
                              <th className="px-4 py-3.5 text-right text-slate-700 dark:text-slate-300" title="Effective Sell Rate or Current Market Price">Sell / Current</th> 
                              <th className="px-4 py-3.5 text-right opacity-80">Comm</th> 
                              <th className="px-4 py-3.5 text-right opacity-80">Tax</th> 
                              <th className="px-4 py-3.5 text-right opacity-80">CDC</th> 
                              <th className="px-4 py-3.5 text-right opacity-80">Other</th> 
                              <th className="px-6 py-3.5 text-right">Net Amount</th> 
                              <th className="px-6 py-3.5 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10">Realized Gain</th> 
                              <th className="px-6 py-3.5 text-right text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10">Unrealized Gain</th> 
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {paginatedActivity.map((t, i) => {
                                const net = t.type === 'BUY' ? -((t.quantity * t.price) + (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : t.type === 'SELL' ? (t.quantity * t.price) - ((t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0)) : (t.quantity * t.price) - (t.tax||0); 
                                return (
                                    <tr key={`${t.id}-${i}`} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group">
                                        <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs tabular-nums">{t.date}</td>
                                        <td className="px-4 py-3.5 font-display font-black text-slate-900 dark:text-white">{t.ticker}</td>
                                        <td className="px-4 py-3.5"> 
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20'}`}>
                                              {t.type}
                                            </span> 
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{t.quantity.toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">{t.type === 'DIVIDEND' ? '-' : formatDecimal(t.avgBuyPrice)}</td>
                                        <td className={`px-4 py-3.5 text-right font-mono text-xs font-bold tabular-nums ${t.type === 'SELL' ? 'text-emerald-600 dark:text-emerald-400' : t.type === 'BUY' ? 'text-rose-500 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{formatDecimal(t.sellOrCurrentPrice)}</td>
                                        <td className="px-4 py-3.5 text-right text-rose-500 dark:text-rose-400 font-mono text-[10px] tabular-nums">{(t.commission || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right text-rose-500 dark:text-rose-400 font-mono text-[10px] tabular-nums">{(t.tax || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right text-rose-500 dark:text-rose-400 font-mono text-[10px] tabular-nums">{(t.cdcCharges || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right text-rose-500 dark:text-rose-400 font-mono text-[10px] tabular-nums">{(t.otherFees || 0).toLocaleString()}</td>
                                        <td className={`px-6 py-3.5 text-right font-bold font-mono tabular-nums ${getColorClass(net)}`}> {formatGain(net)} </td>
                                        <td className={`px-6 py-3.5 text-right font-mono text-xs font-bold bg-emerald-50/30 dark:bg-emerald-900/10 tabular-nums ${t.gainType === 'REALIZED' ? getColorClass(t.gain) : 'text-slate-400'}`}>{t.gainType === 'REALIZED' ? formatGain(t.gain) : '-'}</td>
                                        <td className={`px-6 py-3.5 text-right font-mono text-xs font-bold bg-blue-50/30 dark:bg-blue-900/10 tabular-nums ${t.gainType === 'UNREALIZED' ? getColorClass(t.gain) : 'text-slate-400'}`}>{t.gainType === 'UNREALIZED' ? ( <> {formatGain(t.gain)} {t.remainingQty && t.remainingQty < t.quantity && ( <span className="block text-[8px] opacity-60 font-sans font-normal text-slate-500 dark:text-slate-400 mt-0.5"> (On {t.remainingQty.toLocaleString()}) </span> )} </> ) : '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50/90 dark:bg-slate-800/90 text-xs font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700 shadow-inner">
                            <tr> <td colSpan={10} className="px-6 py-4 text-right text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Grand Total (Visible)</td> <td className={`px-6 py-4 text-right font-mono tabular-nums ${getColorClass(activityTotals.netAmount)}`}> {formatGain(activityTotals.netAmount)} </td> <td className={`px-6 py-4 text-right font-mono tabular-nums ${getColorClass(activityTotals.realized)}`}> {formatGain(activityTotals.realized)} </td> <td className={`px-6 py-3 text-right font-mono tabular-nums ${getColorClass(activityTotals.unrealized)}`}> {formatGain(activityTotals.unrealized)} </td> </tr>
                        </tfoot>
                    </table>
                </div>
                {paginatedActivity.length > 0 && (
                    <div className="p-5 border-t border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3"> 
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Rows:</span> 
                            <select value={activityRowsPerPage} onChange={(e) => { setActivityRowsPerPage(Number(e.target.value)); setActivityPage(1); }} className="bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-lg text-xs py-1.5 px-2 outline-none focus:border-emerald-500 text-slate-700 dark:text-slate-300 font-bold cursor-pointer transition-colors shadow-sm"> <option value={25}>25</option> <option value={50}>50</option> <option value={100}>100</option> </select> 
                        </div>
                        <div className="flex items-center gap-5"> 
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums"> {(activityPage - 1) * activityRowsPerPage + 1}-{Math.min(activityPage * activityRowsPerPage, currentRows.length)} of {currentRows.length} </span> 
                            <div className="flex gap-1.5"> 
                                <button onClick={() => setActivityPage(p => Math.max(1, p - 1))} disabled={activityPage === 1} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300 shadow-sm"><ChevronLeft size={16} /></button> 
                                <button onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))} disabled={activityPage === totalActivityPages || totalActivityPages === 0} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-600 dark:text-slate-300 shadow-sm"><ChevronRight size={16} /></button> 
                            </div> 
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- EMPTY STATE --- */}
        {!selectedTicker && !selectedSector && (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30"> 
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5 text-slate-400 dark:text-slate-500 shadow-inner"> 
                    <BarChart3 size={36} /> 
                </div> 
                <h3 className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">No {analysisMode === 'STOCK' ? 'Stock' : 'Sector'} Selected</h3> 
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Use the search bar above to analyze individual performance metrics.</p> 
            </div>
        )}

        {/* --- SELECTED BUT NOT FOUND STATE --- */}
        {isSelectionNotFound && (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 animate-in fade-in zoom-in-95"> 
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-500/10 rounded-full flex items-center justify-center mb-5 text-amber-500 shadow-inner border border-amber-200/60 dark:border-amber-500/20"> 
                    <AlertCircle size={36} /> 
                </div> 
                <h3 className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">
                    {analysisMode === 'STOCK' ? `Stock "${selectedTicker}" Not Found` : `Sector "${selectedSector}" Not Found`}
                </h3> 
                <p className="text-slate-500 dark:text-slate-400 max-w-md text-center text-sm font-medium leading-relaxed">
                    This selection exists in your overall history but is not present in the currently active portfolio.
                    <br/><br/>
                    Try switching portfolios or enabling "Combined" view in the top header.
                </p> 
                <button 
                    onClick={() => {
                        setSearchTerm('');
                        if (analysisMode === 'STOCK') { setSelectedTicker(null); localStorage.removeItem('psx_last_analyzed_ticker'); }
                        else { setSelectedSector(null); localStorage.removeItem('psx_last_analyzed_sector'); }
                    }}
                    className="mt-6 px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                    Clear Selection
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
