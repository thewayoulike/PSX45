import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Transaction, Holding, PortfolioStats, RealizedTrade, Portfolio, Broker, FoundDividend, EditableTrade } from '../types';
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
import { TickerPerformanceList } from './TickerPerformanceList';
import { TickerProfile } from './TickerProfile';
import { getSector } from '../services/sectors';
import { fetchBatchPSXPrices } from '../services/psxData';
import { setGeminiApiKey } from '../services/gemini';
import { Edit3, Plus, FolderOpen, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins, LogOut, Save, Briefcase, Key, LayoutDashboard, History, CheckCircle2, Pencil, Layers, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { useIdleTimer } from '../hooks/useIdleTimer'; 

import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive, syncTransactionsToSheet, getGoogleSheetId, DriveUser, hasValidSession } from '../services/driveStorage';
import { calculateXIRR } from '../utils/finance';

const INITIAL_TRANSACTIONS: Partial<Transaction>[] = [];

const DEFAULT_BROKER: Broker = {
    id: 'default_01',
    name: 'Standard Broker',
    commissionType: 'HIGHER_OF',
    rate1: 0.15, 
    rate2: 0.05, 
    sstRate: 15,
    isDefault: true
};

const DEFAULT_PORTFOLIO: Portfolio = { id: 'default', name: 'Main Portfolio', defaultBrokerId: 'default_01' };

interface Lot {
    quantity: number;
    costPerShare: number; 
    date: string;
}

type AppView = 'DASHBOARD' | 'REALIZED' | 'HISTORY' | 'STOCKS';

const App: React.FC = () => {
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [googleSheetId, setGoogleSheetId] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('DASHBOARD');
  
  const [viewTicker, setViewTicker] = useState<string | null>(null);
  
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
          if (saved) {
              const parsed = JSON.parse(saved);
              return parsed.filter((t: Transaction) => !t.id.startsWith('auto-cgt-'));
          }
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

  const [scannerState, setScannerState] = useState<Record<string, FoundDividend[]>>(() => {
      try {
          const saved = localStorage.getItem('psx_scanner_state');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [tradeScanResults, setTradeScanResults] = useState<EditableTrade[]>(() => {
      try {
          const saved = localStorage.getItem('psx_trade_scan_results');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return [];
  });

  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null); 
  const [portfolioNameInput, setPortfolioNameInput] = useState('');
  const [portfolioBrokerIdInput, setPortfolioBrokerIdInput] = useState('');

  const [isCombinedView, setIsCombinedView] = useState(false);
  const [combinedPortfolioIds, setCombinedPortfolioIds] = useState<Set<string>>(new Set());
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [manualPrices, setManualPrices] = useState<Record<string, number>>(() => {
      try {
          const saved = localStorage.getItem('psx_manual_prices');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [ldcpMap, setLdcpMap] = useState<Record<string, number>>(() => {
      try {
          const saved = localStorage.getItem('psx_ldcp_map');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [priceTimestamps, setPriceTimestamps] = useState<Record<string, string>>(() => {
      try {
          const saved = localStorage.getItem('psx_price_timestamps');
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
  
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [totalDividendTax, setTotalDividendTax] = useState<number>(0);
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

  const lastPriceUpdate = useMemo(() => {
      const times = Object.values(priceTimestamps);
      if (times.length === 0) return null;
      return times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [priceTimestamps]);

  const sectorMap = useMemo(() => {
      const map: Record<string, string> = {};
      const allTickers = new Set(transactions.map(t => t.ticker));
      allTickers.forEach(t => {
          map[t] = sectorOverrides[t] || getSector(t);
      });
      return map;
  }, [transactions, sectorOverrides]);

  const performLogout = useCallback(() => {
      setTransactions([]); setPortfolios([DEFAULT_PORTFOLIO]); setHoldings([]); setRealizedTrades([]); 
      setManualPrices({}); setLdcpMap({}); setPriceTimestamps({}); setSectorOverrides({}); setBrokers([DEFAULT_BROKER]); setScannerState({}); setTradeScanResults([]);
      setUserApiKey(''); setGeminiApiKey(null); setDriveUser(null); setGoogleSheetId(null); localStorage.clear(); signOutDrive();
  }, []);

  useIdleTimer(1800000, () => {
      if (transactions.length > 0 || driveUser) { performLogout(); alert("Session timed out due to inactivity. Data cleared for security."); }
  });

  const handleManualLogout = () => { if (window.confirm("Logout and clear local data?")) { performLogout(); } };
  const handleLogin = () => signInWithDrive();

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
              setShowFilterDropdown(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      if (isCombinedView && combinedPortfolioIds.size === 0 && portfolios.length > 0) {
          setCombinedPortfolioIds(new Set(portfolios.map(p => p.id)));
      }
  }, [isCombinedView, portfolios, combinedPortfolioIds.size]);

  useEffect(() => {
      initDriveAuth(async (user) => {
          setDriveUser(user);
          setIsAuthChecking(false);
          setShowLogin(false);
          
          getGoogleSheetId().then(id => setGoogleSheetId(id));

          if (!hasMergedCloud.current) {
              setIsCloudSyncing(true);
              try {
                  const cloudData = await loadFromDrive();
                  if (cloudData) {
                      hasMergedCloud.current = true;
                      if (cloudData.portfolios) setPortfolios(cloudData.portfolios);
                      if (cloudData.transactions) {
                          const cleanTx = (cloudData.transactions as Transaction[]).filter(t => !t.id.startsWith('auto-cgt-'));
                          setTransactions(cleanTx);
                      }
                      if (cloudData.manualPrices) setManualPrices(cloudData.manualPrices);
                      if (cloudData.ldcpMap) setLdcpMap(cloudData.ldcpMap); 
                      if (cloudData.priceTimestamps) setPriceTimestamps(cloudData.priceTimestamps);
                      if (cloudData.currentPortfolioId) setCurrentPortfolioId(cloudData.currentPortfolioId);
                      if (cloudData.sectorOverrides) setSectorOverrides(prev => ({ ...prev, ...cloudData.sectorOverrides }));
                      if (cloudData.scannerState) setScannerState(cloudData.scannerState); 
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
      if (!hasValidSession()) { setIsAuthChecking(false); setShowLogin(true); }
  }, []);

  const handleSaveApiKey = (key: string) => { setUserApiKey(key); setGeminiApiKey(key); if (driveUser) saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, ldcpMap, priceTimestamps, brokers, sectorOverrides, scannerState, geminiApiKey: key }); };
  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => { const id = Date.now().toString(); const updatedBrokers = [...brokers, { ...newBroker, id }]; setBrokers(updatedBrokers); };
  const handleUpdateBroker = (updated: Broker) => { const updatedBrokers = brokers.map(b => b.id === updated.id ? updated : b); setBrokers(updatedBrokers); };
  const handleDeleteBroker = (id: string) => { if (window.confirm("Delete this broker?")) { const updatedBrokers = brokers.filter(b => b.id !== id); setBrokers(updatedBrokers); } };
  
  const handleAddTransaction = (txData: Omit<Transaction, 'id' | 'portfolioId'>) => { 
      const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);
      if (!currentPortfolio) return;

      const brokerToUse = brokers.find(b => b.id === currentPortfolio.defaultBrokerId);
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(); 
      
      const newTx: Transaction = { 
          ...txData, 
          id: newId, 
          portfolioId: currentPortfolioId,
          brokerId: currentPortfolio.defaultBrokerId,
          broker: brokerToUse?.name || 'Unknown'
      }; 
      setTransactions(prev => [...prev, newTx]); 
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => { setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t)); setEditingTransaction(null); };
  const handleDeleteTransaction = (id: string) => { if (window.confirm("Are you sure you want to delete this transaction?")) { setTransactions(prev => prev.filter(t => t.id !== id)); } };
  const handleDeleteTransactions = (ids: string[]) => { if (window.confirm(`Are you sure you want to delete ${ids.length} selected transactions?`)) { setTransactions(prev => prev.filter(t => !ids.includes(t.id))); } };

  const handleEditClick = (tx: Transaction) => { setEditingTransaction(tx); setShowAddModal(true); };
  const handleUpdatePrices = (newPrices: Record<string, number>) => { setManualPrices(prev => ({ ...prev, ...newPrices })); const now = new Date().toISOString(); const newTimestamps: Record<string, string> = {}; Object.keys(newPrices).forEach(k => newTimestamps[k] = now); setPriceTimestamps(prev => ({ ...prev, ...newTimestamps })); };
  const handleScannerUpdate = (results: FoundDividend[]) => { setScannerState(prev => ({ ...prev, [currentPortfolioId]: results })); };
  const handleUpdateTradeScanResults = (results: EditableTrade[]) => { setTradeScanResults(results); };

  const openCreatePortfolioModal = () => { setEditingPortfolioId(null); setPortfolioNameInput(''); setPortfolioBrokerIdInput(''); setIsPortfolioModalOpen(true); };
  const openEditPortfolioModal = () => { const current = portfolios.find(p => p.id === currentPortfolioId); if (current) { setEditingPortfolioId(current.id); setPortfolioNameInput(current.name); setPortfolioBrokerIdInput(current.defaultBrokerId); setIsPortfolioModalOpen(true); } };

  const handleSavePortfolio = (e: React.FormEvent) => { e.preventDefault(); if (!portfolioNameInput.trim()) { alert("Portfolio Name is required"); return; } if (!portfolioBrokerIdInput) { alert("A Default Broker is required for every portfolio."); return; } if (editingPortfolioId) { setPortfolios(prev => prev.map(p => p.id === editingPortfolioId ? { ...p, name: portfolioNameInput.trim(), defaultBrokerId: portfolioBrokerIdInput } : p)); } else { const newId = Date.now().toString(); setPortfolios(prev => [...prev, { id: newId, name: portfolioNameInput.trim(), defaultBrokerId: portfolioBrokerIdInput }]); setCurrentPortfolioId(newId); } setPortfolioNameInput(''); setPortfolioBrokerIdInput(''); setEditingPortfolioId(null); setIsPortfolioModalOpen(false); };
  const handleDeletePortfolio = () => { if (portfolios.length === 1) return alert("You cannot delete the last portfolio."); if (window.confirm("Are you sure? This will delete ALL transactions in this portfolio.")) { const idToDelete = currentPortfolioId; setCurrentPortfolioId(portfolios.find(p => p.id !== idToDelete)?.id || portfolios[0].id); setPortfolios(prev => prev.filter(p => p.id !== idToDelete)); setTransactions(prev => prev.filter(t => t.portfolioId !== idToDelete)); setScannerState(prev => { const newState = { ...prev }; delete newState[idToDelete]; return newState; }); } };
  
  const handleTogglePortfolioSelection = (id: string) => { const newSet = new Set(combinedPortfolioIds); if (newSet.has(id)) { if (newSet.size > 1) newSet.delete(id); } else { newSet.add(id); } setCombinedPortfolioIds(newSet); };
  const handleSelectAllPortfolios = () => { setCombinedPortfolioIds(new Set(portfolios.map(p => p.id))); };

  const handleSyncPrices = async () => { const uniqueTickers = Array.from(new Set(holdings.map(h => h.ticker))); if (uniqueTickers.length === 0) return; setIsSyncing(true); setPriceError(false); setFailedTickers(new Set()); try { const newResults = await fetchBatchPSXPrices(uniqueTickers); const failed = new Set<string>(); const validUpdates: Record<string, number> = {}; const ldcpUpdates: Record<string, number> = {}; const newSectors: Record<string, string> = {}; const now = new Date().toISOString(); const timestampUpdates: Record<string, string> = {}; uniqueTickers.forEach(ticker => { const data = newResults[ticker]; if (data && data.price > 0) { validUpdates[ticker] = data.price; timestampUpdates[ticker] = now; if (data.ldcp > 0) ldcpUpdates[ticker] = data.ldcp; if (data.sector && data.sector !== 'Unknown Sector') { newSectors[ticker] = data.sector; } } else { failed.add(ticker); } }); if (Object.keys(validUpdates).length > 0) { setManualPrices(prev => ({ ...prev, ...validUpdates })); setLdcpMap(prev => ({ ...prev, ...ldcpUpdates })); setPriceTimestamps(prev => ({ ...prev, ...timestampUpdates })); } if (Object.keys(newSectors).length > 0) { setSectorOverrides(prev => ({ ...prev, ...newSectors })); } if (failed.size > 0) { setFailedTickers(failed); setPriceError(true); } } catch (e) { console.error(e); setPriceError(true); } finally { setIsSyncing(false); } };

  useEffect(() => { if (brokers.length === 0) return; const generateFees = () => { let newTransactions: Transaction[] = []; brokers.forEach(broker => { if (!broker.annualFee || !broker.feeStartDate || broker.annualFee <= 0) return; let nextDueDate = new Date(broker.feeStartDate); nextDueDate.setFullYear(nextDueDate.getFullYear() + 1); const today = new Date(); while (nextDueDate <= today) { const feeYear = nextDueDate.getFullYear(); const txId = `auto-fee-${broker.id}-${feeYear}`; const exists = transactions.some(t => t.id === txId); if (!exists) { const feeDateStr = nextDueDate.toISOString().split('T')[0]; const newTx: Transaction = { id: txId, portfolioId: currentPortfolioId, ticker: 'ANNUAL FEE', type: 'ANNUAL_FEE', quantity: 1, price: broker.annualFee, date: feeDateStr, broker: broker.name, brokerId: broker.id, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, notes: `Annual Broker Fee (${feeYear})` }; newTransactions.push(newTx); } nextDueDate.setFullYear(nextDueDate.getFullYear() + 1); } }); if (newTransactions.length > 0) { setTransactions(prev => [...prev, ...newTransactions]); } }; generateFees(); }, [brokers, currentPortfolioId]); 
  useEffect(() => { if (portfolios.length > 0 && !portfolios.find(p => p.id === currentPortfolioId)) { setCurrentPortfolioId(portfolios[0].id); } }, [portfolios, currentPortfolioId]);
  
  const portfolioTransactions = useMemo(() => { 
      if (isCombinedView) return transactions.filter(t => combinedPortfolioIds.has(t.portfolioId));
      return transactions.filter(t => t.portfolioId === currentPortfolioId); 
  }, [transactions, currentPortfolioId, isCombinedView, combinedPortfolioIds]);

  // --- MAIN STATS CALCULATION ---
  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0; let totalCost = 0; let totalCommission = 0; let totalSalesTax = 0; let dividendSum = 0; let divTaxSum = 0; let totalCDC = 0; let totalOtherFees = 0; let totalCGT = 0; let totalDeposits = 0; let totalWithdrawals = 0; let historyPnL = 0;
    
    // NEW: Variable to track "Operational Expenses" which reduce profit but aren't withdrawals
    let operationalExpenses = 0; 
    let dailyPL = 0;

    holdings.forEach(h => { 
        totalValue += h.quantity * h.currentPrice; 
        const roundedAvg = Math.round(h.avgPrice * 100) / 100;
        totalCost += h.quantity * roundedAvg;
        const ldcp = ldcpMap[h.ticker] || h.currentPrice;
        dailyPL += (h.currentPrice - ldcp) * h.quantity;
    });
    
    const realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);
    const netRealizedPL = realizedPL - totalCGT; 
    
    const events: { date: string, type: 'IN' | 'OUT' | 'PROFIT' | 'LOSS', amount: number, originalIndex: number }[] = [];
    const txIndexMap = new Map<string, number>();
    portfolioTransactions.forEach((t, idx) => txIndexMap.set(t.id, idx));

    portfolioTransactions.forEach((t, idx) => {
        totalCommission += (t.commission || 0); totalCDC += (t.cdcCharges || 0); totalOtherFees += (t.otherFees || 0);
        
        if (t.type === 'DEPOSIT') {
            totalDeposits += t.price;
            events.push({ date: t.date, type: 'IN', amount: t.price, originalIndex: idx });
        } 
        else if (t.type === 'WITHDRAWAL') {
            totalWithdrawals += t.price;
            events.push({ date: t.date, type: 'OUT', amount: t.price, originalIndex: idx }); 
        }
        else if (t.type === 'ANNUAL_FEE') {
            // FIX: Treat as Expense (Loss), not Withdrawal
            operationalExpenses += t.price;
            events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx });
        }
        else if (t.type === 'OTHER') {
            if (t.category === 'OTHER_TAX') {
                // FIX: Treat as Expense (Loss)
                operationalExpenses += Math.abs(t.price);
                events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
            } else {
                if (t.price >= 0) {
                    totalDeposits += t.price;
                    events.push({ date: t.date, type: 'IN', amount: t.price, originalIndex: idx });
                } else {
                    // Negative Adjustment -> Treated as Expense/Loss
                    operationalExpenses += Math.abs(t.price);
                    events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
                }
            }
        }
        else if (t.type === 'DIVIDEND') { 
            const netDiv = (t.quantity * t.price) - (t.tax || 0);
            dividendSum += netDiv;
            divTaxSum += (t.tax || 0);
            if (netDiv >= 0) events.push({ date: t.date, type: 'PROFIT', amount: netDiv, originalIndex: idx });
        }
        else if (t.type === 'TAX') { 
            totalCGT += t.price; 
            events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx });
        } 
        else if (t.type === 'HISTORY') { 
            totalCGT += (t.tax || 0); 
            historyPnL += t.price; 
            if (t.price >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.price, originalIndex: idx });
            else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
        }
        else { 
            totalSalesTax += (t.tax || 0); 
        }
    });
    
    realizedTrades.forEach((t) => {
        const originalIdx = txIndexMap.get(t.id) ?? 999999; 
        if (t.profit >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.profit, originalIndex: originalIdx });
        else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.profit), originalIndex: originalIdx });
    });

    events.sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.originalIndex - b.originalIndex;
    });

    // --- PROFIT BUFFER LOGIC ---
    let currentPrincipal = 0;
    let peakPrincipal = 0;
    let profitBuffer = 0; 

    events.forEach(e => {
        if (e.type === 'IN') { 
            currentPrincipal += e.amount;
            if (currentPrincipal > peakPrincipal) peakPrincipal = currentPrincipal;
        }
        else if (e.type === 'OUT') { 
            const amount = e.amount;
            if (profitBuffer >= amount) {
                profitBuffer -= amount;
            } else {
                const remainder = amount - profitBuffer;
                profitBuffer = 0;
                currentPrincipal -= remainder;
            }
        }
        else if (e.type === 'LOSS') { 
            profitBuffer -= e.amount;
        }
        else if (e.type === 'PROFIT') { 
            profitBuffer += e.amount;
        }
    });

    const netPrincipal = Math.max(0, currentPrincipal); 
    const peakNetPrincipal = peakPrincipal; 

    let tradingCashFlow = 0; 
    portfolioTransactions.forEach(t => { 
        const val = t.price * t.quantity; 
        const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0); 
        if (t.type === 'BUY') tradingCashFlow -= (val + fees); 
        else if (t.type === 'SELL') tradingCashFlow += (val - fees); 
    });
    
    let cashIn = totalDeposits; 
    let cashOut = totalWithdrawals + totalCGT + operationalExpenses; 
    const freeCash = cashIn - cashOut + tradingCashFlow + historyPnL; 
    
    // --- UPDATED ROI FORMULA ---
    // 1. Numerator Component: Net Capital Gain (Realized - CGT + Unrealized - Expenses)
    const capitalGainNet = netRealizedPL + (totalValue - totalCost) - operationalExpenses;
    
    // 2. Numerator: Total Return = Capital Gain + Net Dividends
    const totalNetReturn = capitalGainNet + dividendSum;
    
    // 3. Denominator: Lifetime Investment (Peak Principal)
    const roiDenominator = peakNetPrincipal > 0 ? peakNetPrincipal : 1;
    
    // 4. Final ROI
    const roi = (totalNetReturn / roiDenominator) * 100;
    
    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

    // MWRR Calc
    const cashFlowsForXIRR: { amount: number, date: Date }[] = [];
    portfolioTransactions.forEach(t => {
        if (t.type === 'DEPOSIT' || (t.type === 'OTHER' && t.price >= 0 && t.category !== 'OTHER_TAX')) {
             cashFlowsForXIRR.push({ amount: -Math.abs(t.price), date: new Date(t.date) });
        } else if (t.type === 'WITHDRAWAL') {
             cashFlowsForXIRR.push({ amount: Math.abs(t.price), date: new Date(t.date) });
        }
    });
    const currentTotalNetWorth = totalValue + freeCash;
    if (currentTotalNetWorth > 0) {
        cashFlowsForXIRR.push({ amount: currentTotalNetWorth, date: new Date() });
    }
    const mwrr = calculateXIRR(cashFlowsForXIRR);
    
    const yesterdayValue = totalValue - dailyPL;
    const dailyPLPercent = yesterdayValue > 0 ? (dailyPL / yesterdayValue) * 100 : 0;
    const reinvestedProfits = Math.max(0, totalCost - Math.max(0, netPrincipal));

    if (dividendSum !== totalDividends) setTotalDividends(dividendSum);
    if (divTaxSum !== totalDividendTax) setTotalDividendTax(divTaxSum);

    return { 
        totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, netRealizedPL, 
        totalDividends: dividendSum, totalDividendTax: divTaxSum, dailyPL, dailyPLPercent, totalCommission, totalSalesTax, totalCDC, 
        totalOtherFees, totalCGT, freeCash, cashInvestment: totalDeposits - totalWithdrawals, 
        netPrincipal, peakNetPrincipal, totalDeposits, reinvestedProfits, roi, mwrr
    };
  }, [holdings, realizedTrades, portfolioTransactions, ldcpMap]); 

  useEffect(() => { 
      if (driveUser || transactions.length > 0) { 
          localStorage.setItem('psx_transactions', JSON.stringify(transactions)); 
          localStorage.setItem('psx_portfolios', JSON.stringify(portfolios)); 
          localStorage.setItem('psx_current_portfolio_id', currentPortfolioId); 
          localStorage.setItem('psx_manual_prices', JSON.stringify(manualPrices)); 
          localStorage.setItem('psx_ldcp_map', JSON.stringify(ldcpMap)); 
          localStorage.setItem('psx_price_timestamps', JSON.stringify(priceTimestamps)); 
          localStorage.setItem('psx_brokers', JSON.stringify(brokers)); 
          localStorage.setItem('psx_sector_overrides', JSON.stringify(sectorOverrides)); 
          localStorage.setItem('psx_scanner_state', JSON.stringify(scannerState)); 
          localStorage.setItem('psx_trade_scan_results', JSON.stringify(tradeScanResults));
      } 
      if (driveUser) { 
          setIsCloudSyncing(true); 
          const timer = setTimeout(async () => { 
              await saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, ldcpMap, priceTimestamps, brokers, sectorOverrides, scannerState, geminiApiKey: userApiKey }); 
              if (transactions.length > 0) {
                  await syncTransactionsToSheet(transactions, portfolios);
                  if (!googleSheetId) { const id = await getGoogleSheetId(); setGoogleSheetId(id); }
              }
              setIsCloudSyncing(false); 
          }, 3000); 
          return () => clearTimeout(timer); 
      } 
  }, [transactions, portfolios, currentPortfolioId, manualPrices, ldcpMap, priceTimestamps, brokers, sectorOverrides, scannerState, tradeScanResults, driveUser, userApiKey, googleSheetId]);

  useEffect(() => { const tempHoldings: Record<string, Holding> = {}; const tempRealized: RealizedTrade[] = []; const lotMap: Record<string, Lot[]> = {}; const sortedTx = [...portfolioTransactions].sort((a, b) => { const dateA = a.date || ''; const dateB = b.date || ''; return dateA.localeCompare(dateB); }); sortedTx.forEach(tx => { if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE' || tx.type === 'OTHER') return; if (tx.type === 'DIVIDEND' || tx.type === 'TAX') return; if (tx.type === 'HISTORY') { tempRealized.push({ id: tx.id, ticker: 'PREV-PNL', broker: tx.broker || 'Unknown', quantity: 1, buyAvg: 0, sellPrice: 0, date: tx.date, profit: tx.price, fees: 0, commission: 0, tax: tx.tax || 0, cdcCharges: 0, otherFees: 0 }); return; } const brokerKey = (tx.broker || 'Unknown'); const holdingKey = `${tx.ticker}|${brokerKey}`; if (!tempHoldings[holdingKey]) { const sector = sectorOverrides[tx.ticker] || getSector(tx.ticker); tempHoldings[holdingKey] = { ticker: tx.ticker, sector: sector, broker: (tx.broker || 'Unknown'), quantity: 0, avgPrice: 0, currentPrice: 0, totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0, }; lotMap[holdingKey] = []; } const h = tempHoldings[holdingKey]; const lots = lotMap[holdingKey]; if (tx.type === 'BUY') { const txFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0); const txTotalCost = (tx.quantity * tx.price) + txFees; const costPerShare = tx.quantity > 0 ? txTotalCost / tx.quantity : 0; lots.push({ quantity: tx.quantity, costPerShare: costPerShare, date: tx.date }); const currentHoldingValue = h.quantity * h.avgPrice; h.quantity += tx.quantity; h.avgPrice = h.quantity > 0 ? (currentHoldingValue + txTotalCost) / h.quantity : 0; h.totalCommission += (tx.commission || 0); h.totalTax += (tx.tax || 0); h.totalCDC += (tx.cdcCharges || 0); h.totalOtherFees += (tx.otherFees || 0); } else if (tx.type === 'SELL') { if (h.quantity > 0) { const qtyToSell = Math.min(h.quantity, tx.quantity); let costBasis = 0; let remainingToSell = qtyToSell; while (remainingToSell > 0 && lots.length > 0) { const currentLot = lots[0]; if (currentLot.quantity > remainingToSell) { costBasis += remainingToSell * currentLot.costPerShare; currentLot.quantity -= remainingToSell; remainingToSell = 0; } else { costBasis += currentLot.quantity * currentLot.costPerShare; remainingToSell -= currentLot.quantity; lots.shift(); } } const saleRevenue = qtyToSell * tx.price; const saleFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0); const realizedProfit = saleRevenue - saleFees - costBasis; tempRealized.push({ id: tx.id, ticker: tx.ticker, broker: tx.broker, quantity: qtyToSell, buyAvg: qtyToSell > 0 ? costBasis / qtyToSell : 0, sellPrice: tx.price, date: tx.date, profit: realizedProfit, fees: saleFees, commission: tx.commission || 0, tax: tx.tax || 0, cdcCharges: tx.cdcCharges || 0, otherFees: tx.otherFees || 0 }); const prevTotalValue = h.quantity * h.avgPrice; h.quantity -= qtyToSell; if (h.quantity > 0) h.avgPrice = (prevTotalValue - costBasis) / h.quantity; else h.avgPrice = 0; const ratio = (h.quantity + qtyToSell) > 0 ? h.quantity / (h.quantity + qtyToSell) : 0; h.totalCommission = h.totalCommission * ratio; h.totalTax = h.totalTax * ratio; h.totalCDC = h.totalCDC * ratio; h.totalOtherFees = h.totalOtherFees * ratio; } } }); const finalHoldings = Object.values(tempHoldings).filter(h => h.quantity > 0.0001).map(h => { const current = manualPrices[h.ticker] || h.avgPrice; const lastUpdated = priceTimestamps[h.ticker]; return { ...h, currentPrice: current, lastUpdated }; }); setHoldings(finalHoldings); setRealizedTrades(tempRealized); }, [portfolioTransactions, manualPrices, priceTimestamps, sectorOverrides]);
  
  const handleGoToStockPage = (ticker: string) => {
      localStorage.setItem('psx_analyzer_mode', 'STOCK');
      localStorage.setItem('psx_last_analyzed_ticker', ticker);
      setCurrentView('STOCKS');
      setViewTicker(null); 
  };

  if (isAuthChecking) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;
  if (showLogin) return <LoginPage onGuestLogin={() => setShowLogin(false)} onGoogleLogin={handleLogin} />;
  
  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans selection:bg-emerald-200">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0"><div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-400/10 rounded-full blur-[120px]"></div><div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-400/10 rounded-full blur-[120px]"></div><div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-blue-400/5 rounded-full blur-[100px]"></div></div>
      
      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8 animate-in fade-in slide-in-from-top-5 duration-500">
          <div className="flex flex-col gap-1">
            <Logo />
            <p className="text-sm ml-1 font-bold tracking-wide mt-1"><span className="text-slate-700">KNOW MORE.</span> <span className="text-cyan-500">EARN MORE.</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
            <div className="flex flex-col items-end mr-4">
                <div className="flex items-center gap-3">
                    {driveUser ? (
                        <div className="flex items-center gap-3 bg-white p-1 pr-3 rounded-xl border border-emerald-200 shadow-sm">
                            {driveUser.picture ? ( <img src={driveUser.picture} alt="User" className="w-8 h-8 rounded-lg border border-emerald-100" /> ) : ( <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 font-bold">{driveUser.name?.[0]}</div> )}
                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Synced</span><span className="text-xs font-bold text-slate-800 max-w-[100px] truncate">{driveUser.name}</span></div>
                            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
                            {isCloudSyncing ? ( <Loader2 size={16} className="text-emerald-500 animate-spin" /> ) : ( <Save size={16} className="text-emerald-500" /> )}
                            <button onClick={handleManualLogout} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors" title="Sign Out"> <LogOut size={16} /> </button>
                        </div>
                    ) : (
                        <button onClick={handleLogin} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold shadow-sm border border-slate-200 transition-all"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="Google" /> Sign in with Google</button>
                    )}
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative group"><FolderOpen size={18} className="absolute left-3 top-2.5 text-emerald-600" /><select value={currentPortfolioId} onChange={(e) => setCurrentPortfolioId(e.target.value)} className="appearance-none bg-transparent border-none text-sm text-slate-700 font-bold py-2 pl-10 pr-8 cursor-pointer focus:ring-0 outline-none w-40 sm:w-48">{portfolios.map(p => <option key={p.id} value={p.id} className="bg-white text-slate-800">{p.name}</option>)}</select></div>
                
                <button onClick={openEditPortfolioModal} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Portfolio Settings"> <Pencil size={16} /> </button>
                <button onClick={openCreatePortfolioModal} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors border border-emerald-100 flex items-center gap-1 pr-3" title="Create New Portfolio"> <PlusCircle size={18} /> <span className="text-xs font-bold">New</span> </button>
                <button onClick={handleDeletePortfolio} className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors border border-slate-100" title="Delete Current Portfolio"> <Trash2 size={18} /> </button>
            </div>
          </div>
        </header>

        <main className="animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex justify-center mb-8">
                <div className="bg-white/80 backdrop-blur border border-slate-200 p-1.5 rounded-2xl flex gap-1 shadow-sm overflow-x-auto">
                    <button onClick={() => setCurrentView('DASHBOARD')} className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${currentView === 'DASHBOARD' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> 
                        <LayoutDashboard size={18} /> Dashboard 
                    </button>
                    
                    <button onClick={() => setCurrentView('STOCKS')} className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${currentView === 'STOCKS' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> 
                        <Briefcase size={18} /> Stocks 
                    </button>

                    <button onClick={() => setCurrentView('REALIZED')} className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${currentView === 'REALIZED' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> 
                        <CheckCircle2 size={18} /> Realized Gains 
                    </button>
                    <button onClick={() => setCurrentView('HISTORY')} className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${currentView === 'HISTORY' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}> 
                        <History size={18} /> History 
                    </button>
                </div>
            </div>

            <div className="relative z-20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white/40 p-4 rounded-2xl border border-white/60 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setEditingTransaction(null); setShowAddModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"> <Plus size={18} /> Add Transaction </button>
                    <button onClick={() => setShowBrokerManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Briefcase size={18} /> Brokers </button>
                    <button onClick={() => setShowDividendScanner(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Coins size={18} /> Scan Dividends </button>
                    <button onClick={() => setShowApiKeyManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2" title="AI Settings"> <Key size={18} className="text-emerald-500" /> <span>API Key</span> </button>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm" ref={filterDropdownRef}>
                        
                        {isCombinedView && (
                            <div className="relative">
                                <button 
                                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                                >
                                    <Layers size={14} />
                                    <span>Select Portfolios ({combinedPortfolioIds.size})</span>
                                    <ChevronDown size={14} className={`transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showFilterDropdown && (
                                    <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
                                        <div className="flex justify-between items-center px-2 py-2 border-b border-slate-100 mb-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Included Portfolios</span>
                                            <button onClick={handleSelectAllPortfolios} className="text-[10px] text-emerald-600 font-bold hover:underline">Select All</button>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                            {portfolios.map(p => {
                                                const isSelected = combinedPortfolioIds.has(p.id);
                                                return (
                                                    <div 
                                                        key={p.id} 
                                                        onClick={() => handleTogglePortfolioSelection(p.id)}
                                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                                                    >
                                                        {isSelected ? 
                                                            <CheckSquare size={16} className="text-emerald-600" /> : 
                                                            <Square size={16} className="text-slate-300" />
                                                        }
                                                        <span className={`text-sm font-medium ${isSelected ? 'text-slate-800' : 'text-slate-500'}`}>{p.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="h-5 w-[1px] bg-slate-200 mx-1"></div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Combined</span>
                            <button 
                                onClick={() => {
                                    const newState = !isCombinedView;
                                    setIsCombinedView(newState);
                                    if (newState) setShowFilterDropdown(true);
                                }} 
                                className={`w-10 h-5 rounded-full relative transition-colors ${isCombinedView ? 'bg-emerald-500' : 'bg-slate-200'}`}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all shadow-sm ${isCombinedView ? 'left-6' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </div>

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
                    <Dashboard stats={stats} lastUpdated={lastPriceUpdate} />
                    <div className="flex flex-col gap-6">
                        <AllocationChart holdings={holdings} />
                        <HoldingsTable 
                            holdings={holdings} 
                            showBroker={true} 
                            failedTickers={failedTickers} 
                            ldcpMap={ldcpMap} 
                            onTickerClick={handleGoToStockPage} 
                        />
                    </div>
                </div>
            )}

            {currentView === 'STOCKS' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TickerPerformanceList 
                        transactions={portfolioTransactions}
                        currentPrices={manualPrices}
                        sectors={sectorMap}
                        onTickerClick={(t) => setViewTicker(t)}
                    />
                </div>
            )}

            {currentView === 'REALIZED' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <RealizedTable trades={realizedTrades} showBroker={true} />
                </div>
            )}

            {currentView === 'HISTORY' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TransactionList 
                        transactions={portfolioTransactions} 
                        onDelete={handleDeleteTransaction} 
                        onDeleteMultiple={handleDeleteTransactions}
                        onEdit={handleEditClick} 
                        googleSheetId={googleSheetId}
                    />
                </div>
            )}

        </main>
      </div>

      {isPortfolioModalOpen && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800">
                          {editingPortfolioId ? 'Edit Portfolio' : 'Create Portfolio'}
                      </h3>
                      <button onClick={() => setIsPortfolioModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSavePortfolio}>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Portfolio Name <span className="text-rose-500">*</span></label>
                      <input type="text" autoFocus placeholder="e.g. My Savings" value={portfolioNameInput} onChange={(e) => setPortfolioNameInput(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 mb-4 outline-none focus:ring-2 focus:ring-emerald-500" />
                      
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default Broker <span className="text-rose-500">*</span></label>
                      <div className="relative mb-6">
                          <select 
                              required
                              value={portfolioBrokerIdInput} 
                              onChange={(e) => setPortfolioBrokerIdInput(e.target.value)} 
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 outline-none appearance-none focus:ring-2 focus:ring-emerald-500"
                          >
                              <option value="">Select a Broker</option>
                              {brokers.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                          </select>
                          <Briefcase size={16} className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" />
                      </div>

                      <button type="submit" disabled={!portfolioNameInput.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all">
                          {editingPortfolioId ? 'Save Changes' : 'Create Portfolio'}
                      </button>
                  </form>
              </div>
          </div>
      )}
      
      <TransactionForm 
          isOpen={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          onAddTransaction={handleAddTransaction} 
          onUpdateTransaction={handleUpdateTransaction} 
          existingTransactions={transactions} 
          editingTransaction={editingTransaction} 
          brokers={brokers} 
          onManageBrokers={() => setShowBrokerManager(true)}
          portfolioDefaultBrokerId={currentPortfolio?.defaultBrokerId}
          freeCash={stats.freeCash}
          savedScannedTrades={tradeScanResults}
          onSaveScannedTrades={handleUpdateTradeScanResults}
      />
      <BrokerManager isOpen={showBrokerManager} onClose={() => setShowBrokerManager(false)} brokers={brokers} onAddBroker={handleAddBroker} onUpdateBroker={handleUpdateBroker} onDeleteBroker={handleDeleteBroker} />
      <ApiKeyManager isOpen={showApiKeyManager} onClose={() => setShowApiKeyManager(false)} apiKey={userApiKey} onSave={handleSaveApiKey} isDriveConnected={!!driveUser} />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />
      
      <DividendScanner 
          key={currentPortfolioId}
          isOpen={showDividendScanner} 
          onClose={() => setShowDividendScanner(false)} 
          transactions={portfolioTransactions} 
          onAddTransaction={handleAddTransaction} 
          onOpenSettings={() => setShowApiKeyManager(true)}
          savedResults={scannerState[currentPortfolioId] || []}
          onSaveResults={handleScannerUpdate}
      />

      {viewTicker && (
          <TickerProfile 
              ticker={viewTicker}
              currentPrice={manualPrices[viewTicker] || 0} 
              sector={sectorOverrides[viewTicker] || getSector(viewTicker)}
              transactions={portfolioTransactions.filter(t => t.ticker === viewTicker)}
              holding={holdings.find(h => h.ticker === viewTicker)} 
              onClose={() => setViewTicker(null)}
          />
      )}
    </div>
  );
};

export default App;
