import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Transaction, Holding, PortfolioStats, RealizedTrade, Portfolio, Broker } from '../types';
import { Dashboard } from './DashboardStats';
import { HoldingsTable } from './HoldingsTable';
import { AllocationChart } from './AllocationChart';
import { RealizedTable } from './RealizedTable';
import { TransactionList } from './TransactionList';
import { TransactionForm } from './TransactionForm';
import { BrokerManager } from './BrokerManager';
import { PriceEditor } from './PriceEditor';
import { DividendScanner } from './DividendScanner';
import { ApiKeyManager } from './ApiKeyManager'; 
import { LoginPage } from './LoginPage';
import { Logo } from './ui/Logo';
import { getSector } from '../services/sectors';
import { fetchBatchPSXPrices } from '../services/psxData';
import { setGeminiApiKey } from '../services/gemini';
import { Edit3, Plus, Filter, FolderOpen, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins, LogOut, Save, Briefcase, Key, LayoutDashboard, History, CheckCircle2, Pencil, Check } from 'lucide-react';
import { useIdleTimer } from '../hooks/useIdleTimer'; 

import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive, DriveUser, hasValidSession } from '../services/driveStorage';

const INITIAL_TRANSACTIONS: Partial<Transaction>[] = [];
const DEFAULT_PORTFOLIO: Portfolio = { id: 'default', name: 'Main Portfolio' };

const DEFAULT_BROKER: Broker = {
    id: 'default_01',
    name: 'Standard Broker',
    commissionType: 'HIGHER_OF',
    rate1: 0.15, 
    rate2: 0.05, 
    sstRate: 15,
    isDefault: true
};

interface Lot {
    quantity: number;
    costPerShare: number; 
    date: string;
}

type AppView = 'DASHBOARD' | 'REALIZED' | 'HISTORY';

const App: React.FC = () => {
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  
  // LOGIN STATE MANAGEMENT
  // We start by assuming we might need to login, unless we find a valid session immediately
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('DASHBOARD');
  
  const [brokers, setBrokers] = useState<Broker[]>(() => {
      try {
          const saved = localStorage.getItem('psx_brokers');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
      } catch (e) { console.error(e); }
      return [DEFAULT_BROKER];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
      try {
          const saved = localStorage.getItem('psx_transactions');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return INITIAL_TRANSACTIONS as Transaction[];
  });

  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => {
      try {
          const saved = localStorage.getItem('psx_portfolios');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return [DEFAULT_PORTFOLIO];
  });

  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>(() => {
      return localStorage.getItem('psx_current_portfolio_id') || DEFAULT_PORTFOLIO.id;
  });

  // --- PORTFOLIO EDIT STATE ---
  const [isEditingPortfolio, setIsEditingPortfolio] = useState(false);
  const [editPortfolioName, setEditPortfolioName] = useState('');

  const [manualPrices, setManualPrices] = useState<Record<string, number>>(() => {
      try {
          const saved = localStorage.getItem('psx_manual_prices');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [sectorOverrides, setSectorOverrides] = useState<Record<string, string>>(() => {
      try {
          const saved = localStorage.getItem('psx_sector_overrides');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [userApiKey, setUserApiKey] = useState<string>('');
  const [groupByBroker, setGroupByBroker] = useState(true);
  const [filterBroker, setFilterBroker] = useState<string>('All');
  
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [priceError, setPriceError] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showDividendScanner, setShowDividendScanner] = useState(false);
  const [showBrokerManager, setShowBrokerManager] = useState(false);
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());

  const hasMergedCloud = useRef(false);

  // --- LOGOUT LOGIC ---
  const performLogout = useCallback(() => {
      setTransactions([]); 
      setPortfolios([DEFAULT_PORTFOLIO]); 
      setHoldings([]); 
      setRealizedTrades([]); 
      setManualPrices({}); 
      setSectorOverrides({}); 
      setBrokers([DEFAULT_BROKER]); 
      setUserApiKey(''); 
      setGeminiApiKey(null);
      setDriveUser(null);
      
      localStorage.clear();
      signOutDrive();
  }, []);

  useIdleTimer(1800000, () => {
      if (transactions.length > 0 || driveUser) {
          performLogout();
          alert("Session timed out due to inactivity. Data cleared for security.");
      }
  });

  const handleManualLogout = () => {
      if (window.confirm("Logout and clear local data?")) {
          performLogout();
      }
  };

  const handleLogin = () => signInWithDrive();

  // --- INITIALIZATION & AUTH ---
  useEffect(() => {
      // 1. Initialize Drive Auth (Loads script, tries to restore session)
      initDriveAuth(async (user) => {
          setDriveUser(user);
          setIsAuthChecking(false);
          setShowLogin(false); // User found, hide login
          
          if (!hasMergedCloud.current) {
              setIsCloudSyncing(true);
              try {
                  const cloudData = await loadFromDrive();
                  if (cloudData) {
                      hasMergedCloud.current = true;
                      if (cloudData.portfolios) setPortfolios(cloudData.portfolios);
                      if (cloudData.transactions) setTransactions(cloudData.transactions);
                      if (cloudData.manualPrices) setManualPrices(cloudData.manualPrices);
                      if (cloudData.currentPortfolioId) setCurrentPortfolioId(cloudData.currentPortfolioId);
                      if (cloudData.sectorOverrides) setSectorOverrides(prev => ({ ...prev, ...cloudData.sectorOverrides }));
                      if (cloudData.brokers) {
                          setBrokers(currentLocal => {
                              const localIds = new Set(currentLocal.map(b => b.id));
                              const missingLocally = (cloudData.brokers as Broker[]).filter(b => !localIds.has(b.id));
                              const merged = [...currentLocal, ...missingLocally];
                              localStorage.setItem('psx_brokers', JSON.stringify(merged));
                              return merged;
                          });
                      }
                      if (cloudData.geminiApiKey) {
                          setUserApiKey(cloudData.geminiApiKey);
                          setGeminiApiKey(cloudData.geminiApiKey); 
                      }
                  }
              } catch (e) { console.error("Drive Load Error", e); } 
              finally { setIsCloudSyncing(false); }
          }
      });

      // 2. Check if we *expect* a session to be restored
      // If we don't have a valid session token locally, stop waiting and show login.
      if (!hasValidSession()) {
          setIsAuthChecking(false);
          setShowLogin(true);
      }
  }, []);

  // --- PERSISTENCE EFFECT ---
  useEffect(() => {
      if (driveUser || transactions.length > 0) {
        localStorage.setItem('psx_transactions', JSON.stringify(transactions));
        localStorage.setItem('psx_portfolios', JSON.stringify(portfolios));
        localStorage.setItem('psx_current_portfolio_id', currentPortfolioId);
        localStorage.setItem('psx_manual_prices', JSON.stringify(manualPrices));
        localStorage.setItem('psx_brokers', JSON.stringify(brokers));
        localStorage.setItem('psx_sector_overrides', JSON.stringify(sectorOverrides));
      }
      
      if (driveUser) {
          setIsCloudSyncing(true);
          const timer = setTimeout(async () => {
              await saveToDrive({
                  transactions, portfolios, currentPortfolioId, manualPrices, brokers, sectorOverrides, geminiApiKey: userApiKey 
              });
              setIsCloudSyncing(false);
          }, 3000); 
          return () => clearTimeout(timer);
      }
  }, [transactions, portfolios, currentPortfolioId, manualPrices, brokers, sectorOverrides, driveUser, userApiKey]);

  // --- HANDLERS ---
  const handleSaveApiKey = (key: string) => { setUserApiKey(key); setGeminiApiKey(key); if (driveUser) saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, brokers, sectorOverrides, geminiApiKey: key }); };
  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => { const id = Date.now().toString(); const updatedBrokers = [...brokers, { ...newBroker, id }]; setBrokers(updatedBrokers); };
  const handleUpdateBroker = (updated: Broker) => { const updatedBrokers = brokers.map(b => b.id === updated.id ? updated : b); setBrokers(updatedBrokers); };
  const handleDeleteBroker = (id: string) => { if (window.confirm("Delete this broker?")) { const updatedBrokers = brokers.filter(b => b.id !== id); setBrokers(updatedBrokers); } };
  const handleAddTransaction = (txData: Omit<Transaction, 'id' | 'portfolioId'>) => { const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(); const newTx: Transaction = { ...txData, id: newId, portfolioId: currentPortfolioId }; setTransactions(prev => [...prev, newTx]); };
  const handleUpdateTransaction = (updatedTx: Transaction) => { setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t)); setEditingTransaction(null); };
  const handleDeleteTransaction = (id: string) => { if (window.confirm("Are you sure you want to delete this transaction?")) { setTransactions(prev => prev.filter(t => t.id !== id)); } };
  const handleEditClick = (tx: Transaction) => { setEditingTransaction(tx); setShowAddModal(true); };
  const handleUpdatePrices = (newPrices: Record<string, number>) => { setManualPrices(prev => ({ ...prev, ...newPrices })); };
  
  // --- PORTFOLIO MANAGMENT HANDLERS ---
  const handleCreatePortfolio = (e: React.FormEvent) => { e.preventDefault(); if (newPortfolioName.trim()) { const newId = Date.now().toString(); setPortfolios(prev => [...prev, { id: newId, name: newPortfolioName.trim() }]); setCurrentPortfolioId(newId); setNewPortfolioName(''); setIsPortfolioModalOpen(false); } };
  
  const handleDeletePortfolio = () => { 
      if (portfolios.length === 1) return alert("You cannot delete the last portfolio."); 
      if (window.confirm("Are you sure? This will delete ALL transactions in this portfolio.")) { 
          const idToDelete = currentPortfolioId; 
          const nextPort = portfolios.find(p => p.id !== idToDelete) || portfolios[0]; 
          setCurrentPortfolioId(nextPort.id); 
          setPortfolios(prev => prev.filter(p => p.id !== idToDelete)); 
          setTransactions(prev => prev.filter(t => t.portfolioId !== idToDelete)); 
      } 
  };

  const startEditingPortfolio = () => {
      const current = portfolios.find(p => p.id === currentPortfolioId);
      if (current) {
          setEditPortfolioName(current.name);
          setIsEditingPortfolio(true);
      }
  };

  const savePortfolioName = () => {
      if (!editPortfolioName.trim()) return;
      setPortfolios(prev => prev.map(p => 
          p.id === currentPortfolioId ? { ...p, name: editPortfolioName.trim() } : p
      ));
      setIsEditingPortfolio(false);
  };

  const handleSyncPrices = async () => { const uniqueTickers = Array.from(new Set(holdings.map(h => h.ticker))); if (uniqueTickers.length === 0) return; setIsSyncing(true); setPriceError(false); setFailedTickers(new Set()); try { const newResults = await fetchBatchPSXPrices(uniqueTickers); const failed = new Set<string>(); const validUpdates: Record<string, number> = {}; const newSectors: Record<string, string> = {}; uniqueTickers.forEach(ticker => { const data = newResults[ticker]; if (data && data.price > 0) { validUpdates[ticker] = data.price; if (data.sector && data.sector !== 'Unknown Sector') { newSectors[ticker] = data.sector; } } else { failed.add(ticker); } }); if (Object.keys(validUpdates).length > 0) { setManualPrices(prev => ({ ...prev, ...validUpdates })); } if (Object.keys(newSectors).length > 0) { setSectorOverrides(prev => ({ ...prev, ...newSectors })); } if (failed.size > 0) { setFailedTickers(failed); setPriceError(true); } } catch (e) { console.error(e); setPriceError(true); } finally { setIsSyncing(false); } };

  useEffect(() => {
      if (portfolios.length > 0 && !portfolios.find(p => p.id === currentPortfolioId)) {
          setCurrentPortfolioId(portfolios[0].id);
      }
  }, [portfolios, currentPortfolioId]);

  const portfolioTransactions = useMemo(() => {
      return transactions.filter(t => t.portfolioId === currentPortfolioId);
  }, [transactions, currentPortfolioId]);

  const displayedTransactions = useMemo(() => {
    if (filterBroker === 'All') return portfolioTransactions;
    return portfolioTransactions.filter(t => t.broker === filterBroker);
  }, [portfolioTransactions, filterBroker]);

  const uniqueBrokers = useMemo(() => {
    const brokers = new Set<string>();
    portfolioTransactions.forEach(t => {
      if (t.broker) brokers.add(t.broker);
    });
    return Array.from(brokers).sort();
  }, [portfolioTransactions]);

  // 1. CALCULATE HOLDINGS & REALIZED (FIFO)
  useEffect(() => {
    const tempHoldings: Record<string, Holding> = {};
    const tempRealized: RealizedTrade[] = [];
    const lotMap: Record<string, Lot[]> = {}; 
    let dividendSum = 0;

    const sortedTx = [...displayedTransactions].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
    });

    sortedTx.forEach(tx => {
      if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL') return;

      if (tx.type === 'DIVIDEND') {
          const grossDiv = tx.quantity * tx.price;
          const netDiv = grossDiv - (tx.tax || 0);
          dividendSum += netDiv;
          return; 
      }
      if (tx.type === 'TAX') return;

      if (tx.type === 'HISTORY') {
          tempRealized.push({
            id: tx.id,
            ticker: 'PREV-PNL', 
            broker: tx.broker || 'Unknown',
            quantity: 1,
            buyAvg: 0,
            sellPrice: 0,
            date: tx.date,
            profit: tx.price, 
            fees: 0,
            commission: 0,
            tax: tx.tax || 0,
            cdcCharges: 0,
            otherFees: 0
          });
          return;
      }

      const brokerKey = groupByBroker ? (tx.broker || 'Unknown') : 'ALL';
      const holdingKey = `${tx.ticker}|${brokerKey}`;

      if (!tempHoldings[holdingKey]) {
        const sector = sectorOverrides[tx.ticker] || getSector(tx.ticker);
        tempHoldings[holdingKey] = {
          ticker: tx.ticker,
          sector: sector,
          broker: groupByBroker ? (tx.broker || 'Unknown') : (filterBroker !== 'All' ? filterBroker : 'Multiple Brokers'),
          quantity: 0,
          avgPrice: 0,
          currentPrice: 0, 
          totalCommission: 0,
          totalTax: 0,
          totalCDC: 0,
          totalOtherFees: 0,
        };
        lotMap[holdingKey] = [];
      }

      const h = tempHoldings[holdingKey];
      const lots = lotMap[holdingKey];

      if (tx.type === 'BUY') {
        const txFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
        const txTotalCost = (tx.quantity * tx.price) + txFees;
        const costPerShare = tx.quantity > 0 ? txTotalCost / tx.quantity : 0;
        lots.push({ quantity: tx.quantity, costPerShare: costPerShare, date: tx.date });

        const currentHoldingValue = h.quantity * h.avgPrice;
        h.quantity += tx.quantity;
        h.avgPrice = h.quantity > 0 ? (currentHoldingValue + txTotalCost) / h.quantity : 0;
        h.totalCommission += (tx.commission || 0);
        h.totalTax += (tx.tax || 0);
        h.totalCDC += (tx.cdcCharges || 0);
        h.totalOtherFees += (tx.otherFees || 0);

      } else if (tx.type === 'SELL') {
        if (h.quantity > 0) {
          const qtyToSell = Math.min(h.quantity, tx.quantity);
          let costBasis = 0;
          let remainingToSell = qtyToSell;

          while (remainingToSell > 0 && lots.length > 0) {
              const currentLot = lots[0]; 
              if (currentLot.quantity > remainingToSell) {
                  costBasis += remainingToSell * currentLot.costPerShare;
                  currentLot.quantity -= remainingToSell;
                  remainingToSell = 0;
              } else {
                  costBasis += currentLot.quantity * currentLot.costPerShare;
                  remainingToSell -= currentLot.quantity;
                  lots.shift();
              }
          }
          
          const saleRevenue = qtyToSell * tx.price;
          const saleFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
          const realizedProfit = saleRevenue - saleFees - costBasis;

          tempRealized.push({
            id: tx.id,
            ticker: tx.ticker,
            broker: tx.broker,
            quantity: qtyToSell,
            buyAvg: qtyToSell > 0 ? costBasis / qtyToSell : 0, 
            sellPrice: tx.price,
            date: tx.date,
            profit: realizedProfit,
            fees: saleFees,
            commission: tx.commission || 0,
            tax: tx.tax || 0,
            cdcCharges: tx.cdcCharges || 0,
            otherFees: tx.otherFees || 0
          });

          const prevTotalValue = h.quantity * h.avgPrice;
          h.quantity -= qtyToSell;
          if (h.quantity > 0) {
              h.avgPrice = (prevTotalValue - costBasis) / h.quantity;
          } else {
              h.avgPrice = 0;
          }
          const ratio = (h.quantity + qtyToSell) > 0 ? h.quantity / (h.quantity + qtyToSell) : 0;
          h.totalCommission = h.totalCommission * ratio;
          h.totalTax = h.totalTax * ratio;
          h.totalCDC = h.totalCDC * ratio;
          h.totalOtherFees = h.totalOtherFees * ratio;
        }
      }
    });

    const finalHoldings = Object.values(tempHoldings)
      .filter(h => h.quantity > 0.0001)
      .map(h => {
        const current = manualPrices[h.ticker] || h.avgPrice;
        return { ...h, currentPrice: current };
      });

    setHoldings(finalHoldings);
    setRealizedTrades(tempRealized);
    setTotalDividends(dividendSum);
  }, [displayedTransactions, groupByBroker, filterBroker, manualPrices, sectorOverrides]);

  // 2. AUTO-CGT
  useEffect(() => {
    if (realizedTrades.length === 0) return;
    const ledger: Record<string, Record<string, number>> = {}; 
    realizedTrades.forEach(t => {
        if (t.ticker === 'PREV-PNL') return;
        const broker = t.broker || 'Unknown Broker';
        const month = t.date.substring(0, 7);
        if (!ledger[broker]) ledger[broker] = {};
        ledger[broker][month] = (ledger[broker][month] || 0) + t.profit;
    });
    const todayStr = new Date().toISOString().substring(0, 7);
    const generatedTaxTx: Transaction[] = [];
    Object.entries(ledger).forEach(([broker, monthsData]) => {
        let runningCgtBalance = 0;
        const sortedMonths = Object.keys(monthsData).sort();
        sortedMonths.forEach(month => {
            if (month >= todayStr) return;
            const netPL = monthsData[month];
            let taxAmount = 0;
            let note = '';
            if (netPL > 0) {
                taxAmount = Number((netPL * 0.15).toFixed(2));
                runningCgtBalance += taxAmount;
                note = `Auto-CGT: Tax on ${month} Profit (${netPL.toFixed(0)}) - ${broker}`;
            } else if (netPL < 0 && runningCgtBalance > 0) {
                const potentialRefund = Number((Math.abs(netPL) * 0.15).toFixed(2));
                const actualRefund = Math.min(potentialRefund, runningCgtBalance);
                if (actualRefund > 0) {
                    taxAmount = -actualRefund;
                    runningCgtBalance -= actualRefund;
                    note = `Auto-CGT: Credit on ${month} Loss (${netPL.toFixed(0)}) - ${broker}`;
                }
            }
            if (taxAmount !== 0) {
                const [y, m] = month.split('-');
                let nextM = parseInt(m) + 1;
                let nextY = parseInt(y);
                if (nextM > 12) { nextM = 1; nextY++; }
                const nextMonthStr = `${nextY}-${nextM.toString().padStart(2, '0')}-01`;
                generatedTaxTx.push({ id: `auto-cgt-${broker}-${month}`, portfolioId: currentPortfolioId, ticker: 'CGT', type: 'TAX', quantity: 1, price: taxAmount, date: nextMonthStr, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, notes: note, broker: broker });
            }
        });
    });
    const cleanTransactions = transactions.filter(t => !t.id.startsWith('auto-cgt-'));
    const mergedTransactions = [...cleanTransactions, ...generatedTaxTx];
    const oldIds = transactions.filter(t => t.id.startsWith('auto-cgt-')).map(t=>t.id).sort().join(',');
    const newIds = generatedTaxTx.map(t=>t.id).sort().join(',');
    if (oldIds !== newIds) { setTransactions(mergedTransactions); }
  }, [realizedTrades, transactions, currentPortfolioId]); 

  // 3. CALCULATE STATS
  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalCommission = 0;
    let totalSalesTax = 0;
    let totalDividendTax = 0;
    let totalCDC = 0;
    let totalOtherFees = 0;
    let totalCGT = 0;
    
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let historyPnL = 0;

    holdings.forEach(h => {
      totalValue += h.quantity * h.currentPrice;
      totalCost += h.quantity * h.avgPrice;
    });

    const realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);

    displayedTransactions.forEach(t => {
        totalCommission += (t.commission || 0);
        totalCDC += (t.cdcCharges || 0);
        totalOtherFees += (t.otherFees || 0);
        
        if (t.type === 'DIVIDEND') {
            totalDividendTax += (t.tax || 0);
        } else if (t.type === 'TAX') {
            totalCGT += (t.price * t.quantity);
        } else if (t.type === 'HISTORY') {
             totalCGT += (t.tax || 0); 
             historyPnL += t.price; 
        } else if (t.type === 'DEPOSIT') {
             totalDeposits += t.price; 
        } else if (t.type === 'WITHDRAWAL') {
             totalWithdrawals += t.price;
        } else {
            totalSalesTax += (t.tax || 0);
        }
    });

    const netRealizedPL = realizedPL - totalCGT; 
    
    const totalProfits = netRealizedPL + totalDividends;
    const withdrawalsFromPrincipal = Math.max(0, totalWithdrawals - totalProfits);
    
    const netPrincipal = totalDeposits - withdrawalsFromPrincipal;
    const cashInvestment = totalDeposits - totalWithdrawals; 

    const netPrincipalAvailable = Math.max(0, netPrincipal);
    const surplusInvested = Math.max(0, totalCost - netPrincipalAvailable);
    const reinvestedProfits = Math.min(surplusInvested, Math.max(0, totalProfits));

    let cashIn = totalDeposits; 
    let cashOut = totalWithdrawals + totalCGT; 

    let tradingCashFlow = 0; 
    displayedTransactions.forEach(t => {
        const val = t.price * t.quantity;
        const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0);
        if (t.type === 'BUY') tradingCashFlow -= (val + fees);
        else if (t.type === 'SELL') tradingCashFlow += (val - fees);
    });

    const freeCash = cashIn - cashOut + tradingCashFlow + historyPnL; 

    const roiDenominator = totalDeposits;
    const totalNetReturn = netRealizedPL + (totalValue - totalCost) + totalDividends;
    
    const roi = roiDenominator > 0 ? (totalNetReturn / roiDenominator) * 100 : 0;

    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

    return { 
        totalValue, totalCost, unrealizedPL, unrealizedPLPercent, 
        realizedPL, netRealizedPL, totalDividends, dailyPL: 0,
        totalCommission, totalSalesTax, totalDividendTax, totalCDC, totalOtherFees, totalCGT,
        freeCash, cashInvestment, netPrincipal, totalDeposits, reinvestedProfits, roi
    };
  }, [holdings, realizedTrades, totalDividends, displayedTransactions]);

  // --- RENDER GATES ---
  if (isAuthChecking) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
        </div>
      );
  }

  if (showLogin) {
      return (
        <LoginPage 
            onGuestLogin={() => setShowLogin(false)}
            onGoogleLogin={handleLogin}
        />
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans selection:bg-emerald-200">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-400/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-400/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-blue-400/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8 animate-in fade-in slide-in-from-top-5 duration-500">
          <div className="flex flex-col gap-1">
            <Logo />
            <p className="text-sm ml-1 font-bold tracking-wide mt-1">
              <span className="text-slate-700">KNOW MORE.</span> <span className="text-cyan-500">EARN MORE.</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
            <div className="flex flex-col items-end mr-4">
                <div className="flex items-center gap-3">
                    {driveUser ? (
                        <div className="flex items-center gap-3 bg-white p-1 pr-3 rounded-xl border border-emerald-200 shadow-sm">
                            {driveUser.picture ? ( <img src={driveUser.picture} alt="User" className="w-8 h-8 rounded-lg border border-emerald-100" /> ) : ( <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 font-bold">{driveUser.name?.[0]}</div> )}
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Synced</span>
                                <span className="text-xs font-bold text-slate-800 max-w-[100px] truncate">{driveUser.name}</span>
                            </div>
                            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
                            {isCloudSyncing ? ( <Loader2 size={16} className="text-emerald-500 animate-spin" /> ) : ( <Save size={16} className="text-emerald-500" /> )}
                            <button onClick={handleManualLogout} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors" title="Sign Out"> <LogOut size={16} /> </button>
                        </div>
                    ) : (
                        <button onClick={handleLogin} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold shadow-sm border border-slate-200 transition-all">
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="Google" />
                            Sign in with Google
                        </button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                {isEditingPortfolio ? (
                    <>
                        <div className="relative flex-1">
                            <FolderOpen size={18} className="absolute left-3 top-3 text-emerald-600" />
                            <input 
                                type="text" 
                                value={editPortfolioName}
                                onChange={(e) => setEditPortfolioName(e.target.value)}
                                className="w-48 bg-slate-50 border border-emerald-200 rounded-lg py-2 pl-10 pr-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && savePortfolioName()}
                            />
                        </div>
                        <button onClick={savePortfolioName} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"> <Check size={18} /> </button>
                        <button onClick={() => setIsEditingPortfolio(false)} className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100"> <X size={18} /> </button>
                    </>
                ) : (
                    <>
                        <div className="relative group">
                            <FolderOpen size={18} className="absolute left-3 top-2.5 text-emerald-600" />
                            <select value={currentPortfolioId} onChange={(e) => setCurrentPortfolioId(e.target.value)} className="appearance-none bg-transparent border-none text-sm text-slate-700 font-bold py-2 pl-10 pr-8 cursor-pointer focus:ring-0 outline-none w-40 sm:w-48">
                                {portfolios.map(p => <option key={p.id} value={p.id} className="bg-white text-slate-800">{p.name}</option>)}
                            </select>
                        </div>
                        <button onClick={startEditingPortfolio} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Rename Portfolio"> <Pencil size={16} /> </button>
                        <button onClick={() => setIsPortfolioModalOpen(true)} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors border border-emerald-100 flex items-center gap-1 pr-3" title="Create New Portfolio"> <PlusCircle size={18} /> <span className="text-xs font-bold">New</span> </button>
                        <button onClick={handleDeletePortfolio} className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors border border-slate-100" title="Delete Current Portfolio"> <Trash2 size={18} /> </button>
                    </>
                )}
            </div>
          </div>
        </header>

        <main className="animate-in fade-in slide-in-from-bottom-5 duration-700">
            
            <div className="flex justify-center mb-8">
                <div className="bg-white/80 backdrop-blur border border-slate-200 p-1.5 rounded-2xl flex gap-1 shadow-sm">
                    <button onClick={() => setCurrentView('DASHBOARD')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'DASHBOARD' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> <LayoutDashboard size={18} /> Dashboard </button>
                    <button onClick={() => setCurrentView('REALIZED')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'REALIZED' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> <CheckCircle2 size={18} /> Realized Gains </button>
                    <button onClick={() => setCurrentView('HISTORY')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'HISTORY' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> <History size={18} /> History </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white/40 p-4 rounded-2xl border border-white/60 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setEditingTransaction(null); setShowAddModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"> <Plus size={18} /> Add Transaction </button>
                    <button onClick={() => setShowBrokerManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Briefcase size={18} /> Brokers </button>
                    <button onClick={() => setShowDividendScanner(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Coins size={18} /> Scan Dividends </button>
                    <button onClick={() => setShowApiKeyManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2" title="AI Settings"> <Key size={18} className="text-emerald-500" /> <span>API Key</span> </button>
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="relative z-20">
                         <div className="absolute left-3 top-3 text-slate-400 pointer-events-none"><Filter size={16} /></div>
                         <select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value)} className="appearance-none bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 pl-10 pr-10 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer min-w-[160px] shadow-sm transition-colors focus:ring-2 focus:ring-emerald-500/20">
                             <option value="All">All Brokers</option>
                             {uniqueBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                         </select>
                    </div>
                    {currentView !== 'HISTORY' && (
                        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                             <button onClick={() => setGroupByBroker(true)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Separate</button>
                             <button onClick={() => setGroupByBroker(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Combine</button>
                        </div>
                    )}
                    {currentView === 'DASHBOARD' && (
                        <>
                            <button onClick={() => setShowPriceEditor(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-3 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2"> <Edit3 size={18} /> <span className="hidden sm:inline">Manual Prices</span> </button>
                             <div className="flex items-center gap-2">
                                <button onClick={handleSyncPrices} disabled={isSyncing} className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"> {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} <span className="hidden sm:inline">Sync PSX</span> </button>
                                {priceError && <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" title="Some prices failed to update. Check list."></div>}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {currentView === 'DASHBOARD' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <Dashboard stats={stats} />
                    <div className="flex flex-col gap-6">
                        <AllocationChart holdings={holdings} />
                        <HoldingsTable holdings={holdings} showBroker={groupByBroker} failedTickers={failedTickers} />
                    </div>
                </div>
            )}

            {currentView === 'REALIZED' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <RealizedTable trades={realizedTrades} showBroker={groupByBroker} />
                </div>
            )}

            {currentView === 'HISTORY' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TransactionList transactions={portfolioTransactions} onDelete={handleDeleteTransaction} onEdit={handleEditClick} />
                </div>
            )}

        </main>
      </div>

      {isPortfolioModalOpen && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Create Portfolio</h3>
                      <button onClick={() => setIsPortfolioModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleCreatePortfolio}>
                      <input type="text" autoFocus placeholder="Portfolio Name" value={newPortfolioName} onChange={(e) => setNewPortfolioName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 mb-4 outline-none focus:ring-2 focus:ring-emerald-500" />
                      <button type="submit" disabled={!newPortfolioName.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all">Create</button>
                  </form>
              </div>
          </div>
      )}
      
      <TransactionForm isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} existingTransactions={transactions} editingTransaction={editingTransaction} brokers={brokers} onManageBrokers={() => setShowBrokerManager(true)} />
      <BrokerManager isOpen={showBrokerManager} onClose={() => setShowBrokerManager(false)} brokers={brokers} onAddBroker={handleAddBroker} onUpdateBroker={handleUpdateBroker} onDeleteBroker={handleDeleteBroker} />
      <ApiKeyManager isOpen={showApiKeyManager} onClose={() => setShowApiKeyManager(false)} apiKey={userApiKey} onSave={handleSaveApiKey} isDriveConnected={!!driveUser} />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />
      <DividendScanner isOpen={showDividendScanner} onClose={() => setShowDividendScanner(false)} transactions={transactions} onAddTransaction={handleAddTransaction} onOpenSettings={() => setShowApiKeyManager(true)} />
    </div>
  );
};

export default App;
