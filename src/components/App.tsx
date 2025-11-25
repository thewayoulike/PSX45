import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Holding, PortfolioStats, RealizedTrade, Portfolio, Broker } from './types';
import { Dashboard } from './components/DashboardStats';
import { HoldingsTable } from './components/HoldingsTable';
import { RealizedTable } from './components/RealizedTable';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { PriceEditor } from './components/PriceEditor';
import { DividendScanner } from './components/DividendScanner';
import { Logo } from './components/ui/Logo';
import { getSector } from './services/sectors';
import { fetchBatchPSXPrices } from './services/psxData';
import { Edit3, Plus, Filter, FolderOpen, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins, LogOut, Save, CloudOff, Cloud } from 'lucide-react';

// Drive Storage Imports
import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive, DriveUser } from './services/driveStorage';

// Initial Data
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

const App: React.FC = () => {
  // Auth State
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(false); // Track unsynced changes

  // Lazy Initialization
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

  const [manualPrices, setManualPrices] = useState<Record<string, number>>(() => {
      try {
          const saved = localStorage.getItem('psx_manual_prices');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  // App Data State (UI)
  const [groupByBroker, setGroupByBroker] = useState(true);
  const [filterBroker, setFilterBroker] = useState<string>('All');

  // UI State
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
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());

  const hasMergedCloud = useRef(false);

  // --- AUTH & DATA LOADING ---
  useEffect(() => {
      initDriveAuth(async (user) => {
          setDriveUser(user);
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

                      if (cloudData.brokers && Array.isArray(cloudData.brokers) && cloudData.brokers.length > 0) {
                          setBrokers(currentLocal => {
                              const localIds = new Set(currentLocal.map(b => b.id));
                              const missingLocally = (cloudData.brokers as Broker[]).filter(b => !localIds.has(b.id));
                              return [...currentLocal, ...missingLocally];
                          });
                      }
                  }
              } catch (e) {
                  console.error("Drive Load Error", e);
              } finally {
                  setIsCloudSyncing(false);
              }
          }
      });
  }, []);

  // --- LOCAL SAVE ---
  useEffect(() => {
      localStorage.setItem('psx_transactions', JSON.stringify(transactions));
      localStorage.setItem('psx_portfolios', JSON.stringify(portfolios));
      localStorage.setItem('psx_current_portfolio_id', currentPortfolioId);
      localStorage.setItem('psx_manual_prices', JSON.stringify(manualPrices));
      localStorage.setItem('psx_brokers', JSON.stringify(brokers));

      if (driveUser && unsyncedChanges) {
          setIsCloudSyncing(true);
          const timer = setTimeout(async () => {
              await saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, brokers });
              setIsCloudSyncing(false);
              setUnsyncedChanges(false);
          }, 3000);
          return () => clearTimeout(timer);
      }
  }, [transactions, portfolios, currentPortfolioId, manualPrices, brokers, driveUser, unsyncedChanges]);

  // --- BROKER ACTIONS ---
  const checkAuth = () => {
      if (!driveUser) setShowSyncModal(true);
  };

  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => {
      const id = Date.now().toString();
      setBrokers(prev => [...prev, { ...newBroker, id }]);
      setUnsyncedChanges(true);
      checkAuth();
  };

  const handleUpdateBroker = (updated: Broker) => {
      setBrokers(prev => prev.map(b => b.id === updated.id ? updated : b));
      setUnsyncedChanges(true);
      checkAuth();
  };

  const handleDeleteBroker = (id: string) => {
      if (confirm("Delete this broker setting?")) {
          setBrokers(prev => prev.filter(b => b.id !== id));
          setUnsyncedChanges(true);
          checkAuth();
      }
  };

  const handleLogin = async () => {
      setShowSyncModal(false);
      await signInWithDrive();
      if (unsyncedChanges && driveUser) {
          setIsCloudSyncing(true);
          await saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, brokers });
          setIsCloudSyncing(false);
          setUnsyncedChanges(false);
      }
  };

  const handleLogout = () => {
      if (confirm("Are you sure you want to logout? Local data will be cleared.")) {
          setTransactions([]);
          setPortfolios([DEFAULT_PORTFOLIO]);
          setHoldings([]);
          setRealizedTrades([]);
          setManualPrices({});
          setBrokers([DEFAULT_BROKER]);
          localStorage.clear();
          signOutDrive();
      }
  };

  // --- APP LOGIC (Derived State) ---
  useEffect(() => {
      if (portfolios.length > 0 && !portfolios.find(p => p.id === currentPortfolioId)) {
          setCurrentPortfolioId(portfolios[0].id);
      }
  }, [portfolios, currentPortfolioId]);

  const portfolioTransactions = useMemo(() => transactions.filter(t => t.portfolioId === currentPortfolioId), [transactions, currentPortfolioId]);

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

  // --- HOLDINGS & REALIZED CALCULATION ---
  useEffect(() => {
    const tempHoldings: Record<string, Holding> = {};
    const tempRealized: RealizedTrade[] = [];
    let dividendSum = 0;

    const sortedTx = [...displayedTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sortedTx.forEach(tx => {
      if (tx.type === 'DIVIDEND') {
          const grossDiv = tx.quantity * tx.price;
          dividendSum += grossDiv - (tx.tax || 0);
          return;
      }

      const brokerKey = groupByBroker ? (tx.broker || 'Unknown') : 'ALL';
      const holdingKey = `${tx.ticker}|${brokerKey}`;

      if (!tempHoldings[holdingKey]) {
        const sector = getSector(tx.ticker);
        tempHoldings[holdingKey] = {
          ticker: tx.ticker,
          sector,
          broker: groupByBroker ? (tx.broker || 'Unknown') : (filterBroker !== 'All' ? filterBroker : 'Multiple Brokers'),
          quantity: 0,
          avgPrice: 0,
          currentPrice: 0,
          totalCommission: 0,
          totalTax: 0,
          totalCDC: 0,
        };
      }

      const h = tempHoldings[holdingKey];

      if (tx.type === 'BUY') {
        const txCost = (tx.quantity * tx.price) + (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0);
        const currentTotalCost = h.quantity * h.avgPrice;
        const newTotalCost = currentTotalCost + txCost;
        const totalQty = h.quantity + tx.quantity;
        h.avgPrice = totalQty > 0 ? newTotalCost / totalQty : 0;
        h.quantity = totalQty;
        h.totalCommission += (tx.commission || 0);
        h.totalTax += (tx.tax || 0);
        h.totalCDC += (tx.cdcCharges || 0);
      } else if (tx.type === 'SELL' && h.quantity > 0) {
        const qtyToSell = Math.min(h.quantity, tx.quantity);
        const costBasisOfSale = qtyToSell * h.avgPrice;
        const saleRevenue = qtyToSell * tx.price;
        const saleFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0);
        const realizedProfit = saleRevenue - saleFees - costBasisOfSale;

        tempRealized.push({
          id: tx.id,
          ticker: tx.ticker,
          broker: tx.broker,
          quantity: qtyToSell,
          buyAvg: h.avgPrice,
          sellPrice: tx.price,
          date: tx.date,
          profit: realizedProfit,
          fees: saleFees
        });

        const ratio = qtyToSell / h.quantity;
        h.totalCommission *= (1 - ratio);
        h.totalTax *= (1 - ratio);
        h.totalCDC *= (1 - ratio);
        h.quantity -= qtyToSell;
      }
    });

    const finalHoldings = Object.values(tempHoldings)
      .filter(h => h.quantity > 0.0001)
      .map(h => ({ ...h, currentPrice: manualPrices[h.ticker] || h.avgPrice }));

    setHoldings(finalHoldings);
    setRealizedTrades(tempRealized);
    setTotalDividends(dividendSum);
  }, [displayedTransactions, groupByBroker, filterBroker, manualPrices]);

  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0, totalCost = 0;
    holdings.forEach(h => { totalValue += h.quantity * h.currentPrice; totalCost += h.quantity * h.avgPrice; });
    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
    const realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);
    return { totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, totalDividends, dailyPL: 0 };
  }, [holdings, realizedTrades, totalDividends]);

  // --- TRANSACTION ACTIONS ---
  const handleAddTransaction = (txData: Omit<Transaction, 'id' | 'portfolioId'>) => {
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
    const newTx: Transaction = { ...txData, id: newId, portfolioId: currentPortfolioId };
    setTransactions(prev => [...prev, newTx]);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleEditClick = (tx: Transaction) => {
      setEditingTransaction(tx);
      setShowAddModal(true);
  };

  const handleUpdatePrices = (newPrices: Record<string, number>) => setManualPrices(prev => ({ ...prev, ...newPrices }));

  // --- PORTFOLIO ACTIONS ---
  const handleCreatePortfolio = (e: React.FormEvent) => {
      e.preventDefault();
      if (newPortfolioName.trim()) {
          const newId = Date.now().toString();
          setPortfolios(prev => [...prev, { id: newId, name: newPortfolioName.trim() }]);
          setCurrentPortfolioId(newId);
          setNewPortfolioName('');
          setIsPortfolioModalOpen(false);
      }
  };

  const handleDeletePortfolio = () => {
      if (portfolios.length === 1) { alert("Cannot delete last portfolio."); return; }
      if (confirm("Delete ALL transactions in this portfolio?")) {
          const idToDelete = currentPortfolioId;
          const nextPort = portfolios.find(p => p.id !== idToDelete) || portfolios[0];
          setCurrentPortfolioId(nextPort.id);
          setPortfolios(prev => prev.filter(p => p.id !== idToDelete));
          setTransactions(prev => prev.filter(t => t.portfolioId !== idToDelete));
      }
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans selection:bg-emerald-200">
      {/* --- UI omitted for brevity, reuse your header/main/modals as is --- */}
      {/* TransactionForm, PriceEditor, DividendScanner, SyncModal, PortfolioModal */}
    </div>
  );
};

export default App;
