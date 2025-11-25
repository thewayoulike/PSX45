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
import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive, DriveUser } from './services/driveStorage';
import { Edit3, Plus, Filter, FolderOpen, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins, LogOut, Save, CloudOff, Cloud } from 'lucide-react';

const DEFAULT_BROKER: Broker = {
  id: 'default_01', name: 'Standard Broker', commissionType: 'HIGHER_OF',
  rate1: 0.15, rate2: 0.05, sstRate: 15, isDefault: true
};
const DEFAULT_PORTFOLIO: Portfolio = { id: 'default', name: 'Main Portfolio' };

const App: React.FC = () => {
  // ----- Auth & Cloud -----
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(false);

  // ----- State -----
  const [brokers, setBrokers] = useState<Broker[]>(() => { try { const s = localStorage.getItem('psx_brokers'); if (s) return JSON.parse(s); } catch {} return [DEFAULT_BROKER]; });
  const [transactions, setTransactions] = useState<Transaction[]>(() => { try { const s = localStorage.getItem('psx_transactions'); if (s) return JSON.parse(s); } catch {} return []; });
  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => { try { const s = localStorage.getItem('psx_portfolios'); if (s) return JSON.parse(s); } catch {} return [DEFAULT_PORTFOLIO]; });
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>(() => localStorage.getItem('psx_current_portfolio_id') || DEFAULT_PORTFOLIO.id);
  const [manualPrices, setManualPrices] = useState<Record<string, number>>(() => { try { const s = localStorage.getItem('psx_manual_prices'); if (s) return JSON.parse(s); } catch {} return {}; });

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [groupByBroker, setGroupByBroker] = useState(true);
  const [filterBroker, setFilterBroker] = useState<string>('All');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showDividendScanner, setShowDividendScanner] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());
  const [priceError, setPriceError] = useState(false);

  const hasMergedCloud = useRef(false);

  // ----- Initialize Drive -----
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
            if (cloudData.brokers && cloudData.brokers.length) {
              setBrokers(curr => {
                const ids = new Set(curr.map(b => b.id));
                const missing = cloudData.brokers.filter(b => !ids.has(b.id));
                return [...curr, ...missing];
              });
            }
          }
        } catch (e) { console.error(e); }
        setIsCloudSyncing(false);
      }
    });
  }, []);

  // ----- Auto-save -----
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

  // ----- Broker Actions -----
  const checkAuth = () => { if (!driveUser) setShowSyncModal(true); };
  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => { const id = Date.now().toString(); setBrokers(prev => [...prev, { ...newBroker, id }]); setUnsyncedChanges(true); checkAuth(); };
  const handleUpdateBroker = (updated: Broker) => { setBrokers(prev => prev.map(b => b.id === updated.id ? updated : b)); setUnsyncedChanges(true); checkAuth(); };
  const handleDeleteBroker = (id: string) => { if (confirm("Delete broker?")) { setBrokers(prev => prev.filter(b => b.id !== id)); setUnsyncedChanges(true); checkAuth(); } };
  const handleLogin = async () => { setShowSyncModal(false); await signInWithDrive(); if (unsyncedChanges && driveUser) { setIsCloudSyncing(true); await saveToDrive({ transactions, portfolios, currentPortfolioId, manualPrices, brokers }); setIsCloudSyncing(false); setUnsyncedChanges(false); } };
  const handleLogout = () => { if (confirm("Logout? Local data cleared.")) { setTransactions([]); setPortfolios([DEFAULT_PORTFOLIO]); setHoldings([]); setRealizedTrades([]); setManualPrices({}); setBrokers([DEFAULT_BROKER]); localStorage.clear(); signOutDrive(); } };

  // ----- Portfolio Transactions -----
  const portfolioTransactions = useMemo(() => transactions.filter(t => t.portfolioId === currentPortfolioId), [transactions, currentPortfolioId]);
  const displayedTransactions = useMemo(() => filterBroker === 'All' ? portfolioTransactions : portfolioTransactions.filter(t => t.broker === filterBroker), [portfolioTransactions, filterBroker]);
  const uniqueBrokers = useMemo(() => Array.from(new Set(portfolioTransactions.map(t => t.broker || 'Unknown'))).sort(), [portfolioTransactions]);

  // ----- Holdings & Realized Trades -----
  useEffect(() => {
    const tempHoldings: Record<string, Holding> = {};
    const tempRealized: RealizedTrade[] = [];
    let dividendSum = 0;

    const sortedTx = [...displayedTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sortedTx.forEach(tx => {
      if (tx.type === 'DIVIDEND') { dividendSum += (tx.quantity * tx.price - (tx.tax || 0)); return; }
      const brokerKey = groupByBroker ? (tx.broker || 'Unknown') : 'ALL';
      const key = `${tx.ticker}|${brokerKey}`;
      if (!tempHoldings[key]) tempHoldings[key] = { ticker: tx.ticker, sector: getSector(tx.ticker), broker: groupByBroker ? (tx.broker || 'Unknown') : (filterBroker !== 'All' ? filterBroker : 'Multiple Brokers'), quantity: 0, avgPrice: 0, currentPrice: 0, totalCommission: 0, totalTax: 0, totalCDC: 0 };
      const h = tempHoldings[key];

      if (tx.type === 'BUY') {
        const cost = (tx.quantity * tx.price) + (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0);
        const totalQty = h.quantity + tx.quantity;
        h.avgPrice = totalQty ? (h.avgPrice * h.quantity + cost) / totalQty : 0;
        h.quantity = totalQty;
        h.totalCommission += (tx.commission || 0);
        h.totalTax += (tx.tax || 0);
        h.totalCDC += (tx.cdcCharges || 0);
      } else if (tx.type === 'SELL' && h.quantity > 0) {
        const qty = Math.min(h.quantity, tx.quantity);
        const profit = qty * tx.price - qty * h.avgPrice - ((tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0));
        tempRealized.push({ id: tx.id, ticker: tx.ticker, broker: tx.broker, quantity: qty, buyAvg: h.avgPrice, sellPrice: tx.price, date: tx.date, profit, fees: (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) });
        const ratio = qty / h.quantity;
        h.totalCommission *= (1 - ratio);
        h.totalTax *= (1 - ratio);
        h.totalCDC *= (1 - ratio);
        h.quantity -= qty;
      }
    });

    setHoldings(Object.values(tempHoldings).filter(h => h.quantity > 0.0001).map(h => ({ ...h, currentPrice: manualPrices[h.ticker] || h.avgPrice })));
    setRealizedTrades(tempRealized);
    setTotalDividends(dividendSum);
  }, [displayedTransactions, groupByBroker, filterBroker, manualPrices]);

  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0, totalCost = 0;
    holdings.forEach(h => { totalValue += h.quantity * h.currentPrice; totalCost += h.quantity * h.avgPrice; });
    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost ? (unrealizedPL / totalCost) * 100 : 0;
    const realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);
    return { totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, totalDividends, dailyPL: 0 };
  }, [holdings, realizedTrades, totalDividends]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans">
      {/* HEADER, PORTFOLIO SELECT, SYNC BUTTONS */}
      {/* DASHBOARD, HOLDINGS TABLE, REALIZED TABLE, TRANSACTION LIST */}
      {/* MODALS: TransactionForm, PriceEditor, DividendScanner, SyncModal, PortfolioModal */}
      {/* The full UI from your original App.tsx can be pasted here unchanged */}
    </div>
  );
};

export default App;
