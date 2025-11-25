import React, { useState, useEffect, useMemo } from 'react';
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
import { Edit3, Plus, Filter, FolderOpen, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins, LogOut, Save } from 'lucide-react';
import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive, DriveUser } from './services/driveStorage';

// Initial Data
const DEFAULT_PORTFOLIO: Portfolio = { id: 'default', name: 'Main Portfolio' };

// Default Broker Logic for new users
const DEFAULT_BROKER: Broker = {
    id: 'default_01',
    name: 'Standard Broker',
    commissionType: 'HIGHER_OF',
    rate1: 0.15, // 0.15%
    rate2: 0.05, // 0.05 per share
    sstRate: 15,
    isDefault: true
};

const App: React.FC = () => {
  // Auth State
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // App Data State
  const [groupByBroker, setGroupByBroker] = useState(true);
  const [filterBroker, setFilterBroker] = useState<string>('All');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([DEFAULT_PORTFOLIO]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>(DEFAULT_PORTFOLIO.id);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
  
  // NEW: Brokers State
  const [brokers, setBrokers] = useState<Broker[]>([]);

  // UI State
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showDividendScanner, setShowDividendScanner] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());

  // --- AUTHENTICATION & DATA LOADING ---
  useEffect(() => {
      initDriveAuth(async (user) => {
          setDriveUser(user);
          setIsCloudSyncing(true);
          try {
              const cloudData = await loadFromDrive();
              if (cloudData) {
                  if (cloudData.portfolios) setPortfolios(cloudData.portfolios);
                  if (cloudData.transactions) setTransactions(cloudData.transactions);
                  if (cloudData.manualPrices) setManualPrices(cloudData.manualPrices);
                  if (cloudData.currentPortfolioId) setCurrentPortfolioId(cloudData.currentPortfolioId);
                  // Load brokers from cloud, or fallback to default if empty
                  if (cloudData.brokers && Array.isArray(cloudData.brokers)) {
                      setBrokers(cloudData.brokers);
                  } else {
                      setBrokers([DEFAULT_BROKER]);
                  }
              }
          } catch (e) {
              console.error("Drive Load Error", e);
          } finally {
              setIsCloudSyncing(false);
          }
      });
      loadFromLocalStorage();
  }, []);

  const loadFromLocalStorage = () => {
      try {
          const savedPortfolios = localStorage.getItem('psx_portfolios');
          const savedTx = localStorage.getItem('psx_transactions');
          const savedPrices = localStorage.getItem('psx_manual_prices');
          const savedPortId = localStorage.getItem('psx_current_portfolio_id');
          const savedBrokers = localStorage.getItem('psx_brokers'); // New Key

          if (savedPortfolios) setPortfolios(JSON.parse(savedPortfolios));
          if (savedPrices) setManualPrices(JSON.parse(savedPrices));
          if (savedPortId) setCurrentPortfolioId(savedPortId);
          
          if (savedBrokers) {
              setBrokers(JSON.parse(savedBrokers));
          } else if (!savedTx) { // Only set default if fresh
              setBrokers([DEFAULT_BROKER]);
          }

          if (savedTx) {
              let parsed: any[] = JSON.parse(savedTx);
              if (parsed.length > 0 && !parsed[0].portfolioId) {
                  parsed = parsed.map((t: any) => ({ ...t, portfolioId: DEFAULT_PORTFOLIO.id }));
              }
              setTransactions(parsed);
          }
      } catch (e) { console.error("Local storage error", e); }
  };

  // --- DATA SAVING ---
  useEffect(() => {
      localStorage.setItem('psx_transactions', JSON.stringify(transactions));
      localStorage.setItem('psx_portfolios', JSON.stringify(portfolios));
      localStorage.setItem('psx_current_portfolio_id', currentPortfolioId);
      localStorage.setItem('psx_manual_prices', JSON.stringify(manualPrices));
      localStorage.setItem('psx_brokers', JSON.stringify(brokers)); // Save Brokers
      
      if (driveUser) {
          setIsCloudSyncing(true);
          const timer = setTimeout(async () => {
              await saveToDrive({
                  transactions,
                  portfolios,
                  currentPortfolioId,
                  manualPrices,
                  brokers // Sync Brokers
              });
              setIsCloudSyncing(false);
          }, 3000); 
          return () => clearTimeout(timer);
      }
  }, [transactions, portfolios, currentPortfolioId, manualPrices, brokers, driveUser]);

  // --- ACTIONS ---
  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => {
      const id = Date.now().toString();
      setBrokers(prev => [...prev, { ...newBroker, id }]);
  };

  const handleUpdateBroker = (updated: Broker) => {
      setBrokers(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleDeleteBroker = (id: string) => {
      if (confirm("Delete this broker setting? Existing transactions will retain their data.")) {
          setBrokers(prev => prev.filter(b => b.id !== id));
      }
  };

  const handleLogout = () => {
      setTransactions([]);
      setPortfolios([DEFAULT_PORTFOLIO]);
      setHoldings([]);
      setRealizedTrades([]);
      setManualPrices({});
      setBrokers([DEFAULT_BROKER]); // Reset to default
      
      localStorage.removeItem('psx_portfolios');
      localStorage.removeItem('psx_transactions');
      localStorage.removeItem('psx_manual_prices');
      localStorage.removeItem('psx_current_portfolio_id');
      localStorage.removeItem('psx_custom_brokers');
      localStorage.removeItem('psx_brokers');
      
      signOutDrive();
  };

  // Boilerplate Logic specific to this view
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

  // Holdings Calculation
  useEffect(() => {
    const tempHoldings: Record<string, Holding> = {};
    const tempRealized: RealizedTrade[] = [];
    let dividendSum = 0;

    const sortedTx = [...displayedTransactions].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
    });

    sortedTx.forEach(tx => {
      if (tx.type === 'DIVIDEND') {
          const grossDiv = tx.quantity * tx.price;
          const netDiv = grossDiv - (tx.tax || 0);
          dividendSum += netDiv;
          return; 
      }

      const brokerKey = groupByBroker ? (tx.broker || 'Unknown') : 'ALL';
      const holdingKey = `${tx.ticker}|${brokerKey}`;

      if (!tempHoldings[holdingKey]) {
        const sector = getSector(tx.ticker);
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

      } else if (tx.type === 'SELL') {
        if (h.quantity > 0) {
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
          h.totalCommission = h.totalCommission * (1 - ratio);
          h.totalTax = h.totalTax * (1 - ratio);
          h.totalCDC = h.totalCDC * (1 - ratio);
          h.quantity -= qtyToSell;
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
    
  }, [displayedTransactions, groupByBroker, filterBroker, manualPrices]);

  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;

    holdings.forEach(h => {
      totalValue += h.quantity * h.currentPrice;
      totalCost += h.quantity * h.avgPrice;
    });

    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
    const realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);

    return { totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, totalDividends, dailyPL: 0 };
  }, [holdings, realizedTrades, totalDividends]);

  // Handlers
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
    if (confirm("Delete transaction?")) {
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleLogin = () => signInWithDrive();
  
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
      if (portfolios.length === 1) {
          alert("Cannot delete last portfolio.");
          return;
      }
      if (confirm("Delete Portfolio? This removes all its transactions.")) {
          const idToDelete = currentPortfolioId;
          const nextPort = portfolios.find(p => p.id !== idToDelete) || portfolios[0];
          setCurrentPortfolioId(nextPort.id);
          setPortfolios(prev => prev.filter(p => p.id !== idToDelete));
          setTransactions(prev => prev.filter(t => t.portfolioId !== idToDelete));
      }
  };

  const handleUpdatePrices = (newPrices: Record<string, number>) => {
      setManualPrices(prev => ({ ...prev, ...newPrices }));
  };
  
  const handleSyncPrices = async () => {
      const uniqueTickers = Array.from(new Set(holdings.map(h => h.ticker)));
      if (uniqueTickers.length === 0) return;
      setIsSyncing(true);
      try {
          const newPrices = await fetchBatchPSXPrices(uniqueTickers);
          const validUpdates: Record<string, number> = {};
          uniqueTickers.forEach(ticker => {
              const price = newPrices[ticker];
              if (price && price > 0) validUpdates[ticker] = price;
          });
          if (Object.keys(validUpdates).length > 0) setManualPrices(prev => ({ ...prev, ...validUpdates }));
      } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans selection:bg-emerald-200">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-400/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-400/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-blue-400/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10 animate-in fade-in slide-in-from-top-5 duration-500">
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
                            {driveUser.picture ? (
                                <img src={driveUser.picture} alt="User" className="w-8 h-8 rounded-lg border border-emerald-100" />
                            ) : (
                                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 font-bold">{driveUser.name?.[0]}</div>
                            )}
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Synced (Drive)</span>
                                <span className="text-xs font-bold text-slate-800 max-w-[100px] truncate">{driveUser.name}</span>
                            </div>
                            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
                            {isCloudSyncing ? <Loader2 size={16} className="text-emerald-500 animate-spin" /> : <Save size={16} className="text-emerald-500" />}
                            <button onClick={handleLogout} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors" title="Sign Out">
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleLogin} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold shadow-sm border border-slate-200 transition-all">
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="Google" />
                            Sync with Drive
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative group">
                    <FolderOpen size={18} className="absolute left-3 top-2.5 text-emerald-600" />
                    <select value={currentPortfolioId} onChange={(e) => setCurrentPortfolioId(e.target.value)} className="appearance-none bg-transparent border-none text-sm text-slate-700 font-bold py-2 pl-10 pr-8 cursor-pointer focus:ring-0 outline-none w-40 sm:w-48">
                        {portfolios.map(p => <option key={p.id} value={p.id} className="bg-white text-slate-800">{p.name}</option>)}
                    </select>
                </div>
                <button onClick={() => setIsPortfolioModalOpen(true)} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors border border-emerald-100 flex items-center gap-1 pr-3" title="Create New Portfolio">
                    <PlusCircle size={18} /> <span className="text-xs font-bold">New</span>
                </button>
                <button onClick={handleDeletePortfolio} className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors border border-slate-100" title="Delete Current Portfolio">
                    <Trash2 size={18} />
                </button>
            </div>
          </div>
        </header>

        <main className="animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingTransaction(null); setShowAddModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2">
                        <Plus size={18} /> Add Transaction
                    </button>
                    <button onClick={() => setShowDividendScanner(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2">
                        <Coins size={18} /> Scan Dividends
                    </button>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <div className="relative z-20">
                         <div className="absolute left-3 top-3 text-slate-400 pointer-events-none"><Filter size={16} /></div>
                         <select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value)} className="appearance-none bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 pl-10 pr-10 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer min-w-[160px] shadow-sm transition-colors focus:ring-2 focus:ring-emerald-500/20">
                             <option value="All">All Brokers</option>
                             {uniqueBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                         </select>
                    </div>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                         <button onClick={() => setGroupByBroker(true)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Separate</button>
                         <button onClick={() => setGroupByBroker(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Combine</button>
                    </div>

                    <button onClick={() => setShowPriceEditor(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-3 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
                        <Edit3 size={18} /> <span className="hidden sm:inline">Manual Prices</span>
                    </button>

                     <div className="flex items-center gap-2">
                        <button onClick={handleSyncPrices} disabled={isSyncing} className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                            <span className="hidden sm:inline">Sync PSX</span>
                        </button>
                    </div>
                </div>
            </div>

            <Dashboard stats={stats} />

            <HoldingsTable 
                holdings={holdings} 
                showBroker={groupByBroker} 
                failedTickers={failedTickers} 
            />

            <RealizedTable trades={realizedTrades} showBroker={groupByBroker} />
            <TransactionList 
                transactions={portfolioTransactions} 
                onDelete={handleDeleteTransaction} 
                onEdit={(tx) => { setEditingTransaction(tx); setShowAddModal(true); }}
            />
        </main>
      </div>

      {/* MODALS */}
      <TransactionForm 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        onAddTransaction={handleAddTransaction}
        onUpdateTransaction={handleUpdateTransaction}
        existingTransactions={transactions}
        editingTransaction={editingTransaction} 
        brokers={brokers}
        onAddBroker={handleAddBroker}
        onUpdateBroker={handleUpdateBroker}
        onDeleteBroker={handleDeleteBroker}
      />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />
      <DividendScanner isOpen={showDividendScanner} onClose={() => setShowDividendScanner(false)} transactions={transactions} onAddTransaction={handleAddTransaction} />
      
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
    </div>
  );
};

export default App;
