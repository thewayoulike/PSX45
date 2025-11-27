import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import { Transaction, Holding, PortfolioStats, RealizedTrade, Broker, DriveUser } from '../types';
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
// ✅ ADDED MISSING IMPORT HERE
import { Logo } from './ui/Logo'; 
import { getSector } from '../services/sectors';
import { fetchBatchPSXPrices } from '../services/psxData';
import { setGeminiApiKey } from '../services/gemini';
// ✅ ADDED MISSING LogOut IMPORT HERE
import { Edit3, Plus, Filter, RefreshCw, Loader2, Coins, Briefcase, Key, LayoutDashboard, History, CheckCircle2, LogOut } from 'lucide-react';

import { initDriveAuth, signInWithDrive, signOutDrive, saveToDrive, loadFromDrive } from '../services/driveStorage';

// --- INITIAL DATA ---
const INITIAL_BROKERS: Broker[] = [
  { id: 'default', name: 'KASB / Ktrade', commissionType: 'HIGHER_OF', rate1: 0.15, rate2: 0.05, sstRate: 13, isDefault: true },
  { id: 'akd', name: 'AKD Securities', commissionType: 'HIGHER_OF', rate1: 0.15, rate2: 0.05, sstRate: 13 }
];

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- AUTH STATE ---
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // --- DATA STATE ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>(INITIAL_BROKERS);
  const [userApiKey, setUserApiKey] = useState<string>('');
  
  // --- UI STATE ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBrokerManager, setShowBrokerManager] = useState(false);
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showDividendScanner, setShowDividendScanner] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  const [filterBroker, setFilterBroker] = useState<string>('All');
  const [groupByBroker, setGroupByBroker] = useState(false);
  
  // --- PRICE SYNC STATE ---
  const [isSyncing, setIsSyncing] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());
  // Store manual prices or synced prices: { "OGDC": 120.5 }
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  // --- AUTH & LOAD EFFECT ---
  useEffect(() => {
    initDriveAuth(async (user) => {
      setDriveUser(user);
      setIsCloudSyncing(true);
      const data = await loadFromDrive();
      if (data) {
        if (data.transactions) setTransactions(data.transactions);
        if (data.brokers) setBrokers(data.brokers);
        if (data.apiKey) {
           setUserApiKey(data.apiKey);
           setGeminiApiKey(data.apiKey);
        }
      }
      setIsCloudSyncing(false);
      setShowLogin(false);
    });
    
    // Allow guest access if no auth after 1 sec
    setTimeout(() => {
        setIsAuthChecking(false);
    }, 1000);
  }, []);

  const handleLogin = () => {
    signInWithDrive();
  };

  const handleGuestLogin = () => {
    setShowLogin(false);
  };

  // --- SAVE EFFECT ---
  useEffect(() => {
    if (driveUser && !isCloudSyncing) {
       const timer = setTimeout(() => {
           saveToDrive({ transactions, brokers, apiKey: userApiKey });
       }, 2000);
       return () => clearTimeout(timer);
    }
  }, [transactions, brokers, userApiKey, driveUser, isCloudSyncing]);

  // --- CALCULATIONS (MEMOIZED) ---
  
  // 1. Unique Brokers for Filter
  const uniqueBrokers = useMemo(() => {
      const bNames = new Set(transactions.map(t => t.broker).filter(Boolean) as string[]);
      return Array.from(bNames);
  }, [transactions]);

  // 2. Filtered Transactions
  const portfolioTransactions = useMemo(() => {
      if (filterBroker === 'All') return transactions;
      return transactions.filter(t => t.broker === filterBroker);
  }, [transactions, filterBroker]);

  // 3. Process Holdings & Realized Gains
  const { holdings, realizedTrades, stats } = useMemo(() => {
      const map = new Map<string, Holding>();
      const realized: RealizedTrade[] = [];
      let totalDeposits = 0;
      let totalWithdrawals = 0;
      let totalDividends = 0;
      let totalTax = 0; // Sales Tax + Div Tax
      let totalCommission = 0;
      let totalCDC = 0;
      let totalOther = 0;
      let totalCGT = 0; // Explicit Capital Gains Tax transactions

      // Sort chronological
      const sorted = [...portfolioTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      sorted.forEach(tx => {
          // Accumulate Fees
          if (tx.type !== 'TAX') {
            totalCommission += (tx.commission || 0);
            totalTax += (tx.tax || 0);
            totalCDC += (tx.cdcCharges || 0);
            totalOther += (tx.otherFees || 0);
          }

          if (tx.type === 'DEPOSIT') totalDeposits += (tx.price); // Price field used for amount
          if (tx.type === 'WITHDRAWAL') totalWithdrawals += (tx.price);
          
          if (tx.type === 'DIVIDEND') {
             totalDividends += ((tx.quantity * tx.price) - (tx.tax || 0)); // Net Dividend
             return;
          }

          if (tx.type === 'TAX') {
              totalCGT += tx.price; // Price field used for Tax Amount
              return;
          }

          if (tx.type === 'HISTORY') {
              // Handle legacy P&L if needed, for now ignore or add to realized
              realized.push({
                  id: tx.id,
                  ticker: 'HISTORY',
                  date: tx.date,
                  quantity: 0,
                  buyAvg: 0,
                  sellPrice: tx.price, // Profit amount
                  profit: tx.price,
                  commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, fees: 0
              });
              return;
          }

          const key = groupByBroker && tx.broker ? `${tx.ticker}-${tx.broker}` : tx.ticker;
          
          if (!map.has(key)) {
              map.set(key, {
                  ticker: tx.ticker,
                  sector: getSector(tx.ticker),
                  broker: groupByBroker ? tx.broker : undefined,
                  quantity: 0,
                  avgPrice: 0,
                  currentPrice: marketPrices[tx.ticker] || 0,
                  totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0
              });
          }

          const h = map.get(key)!;

          if (tx.type === 'BUY') {
              const totalCost = (h.quantity * h.avgPrice) + (tx.quantity * tx.price);
              const newQty = h.quantity + tx.quantity;
              h.avgPrice = newQty > 0 ? totalCost / newQty : 0;
              h.quantity = newQty;
              
              // Add fees to holding specifically
              h.totalCommission += tx.commission || 0;
              h.totalTax += tx.tax || 0;
              h.totalCDC += tx.cdcCharges || 0;
              h.totalOtherFees += tx.otherFees || 0;

          } else if (tx.type === 'SELL') {
              // Realized Gain logic (Average Cost)
              const costBasis = tx.quantity * h.avgPrice;
              const sellValue = tx.quantity * tx.price;
              
              // Pro-rate fees for realized trade
              const tradeFees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
              
              const netProfit = sellValue - costBasis - tradeFees;

              realized.push({
                  id: tx.id,
                  ticker: tx.ticker,
                  broker: tx.broker,
                  quantity: tx.quantity,
                  buyAvg: h.avgPrice,
                  sellPrice: tx.price,
                  date: tx.date,
                  profit: netProfit,
                  fees: tradeFees,
                  commission: tx.commission || 0,
                  tax: tx.tax || 0,
                  cdcCharges: tx.cdcCharges || 0,
                  otherFees: tx.otherFees || 0
              });

              h.quantity -= tx.quantity;
              if (h.quantity <= 0.001) h.quantity = 0; // Floating point fix
          }
      });

      // Stats Aggregation
      const activeHoldings = Array.from(map.values()).filter(h => h.quantity > 0);
      let totalValue = 0;
      let totalCost = 0;
      
      activeHoldings.forEach(h => {
          // Update current price if available
          if (marketPrices[h.ticker]) h.currentPrice = marketPrices[h.ticker];
          
          totalValue += h.quantity * h.currentPrice;
          totalCost += h.quantity * h.avgPrice;
      });

      const unrealizedPL = totalValue - totalCost;
      const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
      const realizedPL = realized.reduce((sum, r) => sum + r.profit, 0);
      const netRealizedPL = realizedPL; // Already net of trade fees

      const netPrincipal = totalDeposits - totalWithdrawals;
      // Free Cash = Net Principal + Realized P&L + Dividends - Cost of Active Holdings - Tax Paid(CGT)
      const freeCash = netPrincipal + realizedPL + totalDividends - totalCost - totalCGT;
      const reinvestedProfits = Math.max(0, (totalValue + freeCash) - netPrincipal);
      
      // ROI = ((Net Worth - Principal) / Principal) * 100
      const totalNetWorth = totalValue + freeCash;
      const roi = netPrincipal > 0 ? ((totalNetWorth - netPrincipal) / netPrincipal) * 100 : 0;

      return {
          holdings: activeHoldings,
          realizedTrades: realized,
          stats: {
              totalValue,
              totalCost,
              unrealizedPL,
              unrealizedPLPercent,
              realizedPL, // This is technically Net Realized P&L in this logic
              netRealizedPL,
              totalDividends,
              dailyPL: 0, // Not implemented
              totalCommission,
              totalSalesTax: totalTax,
              totalDividendTax: 0, // Included in totalTax for simplicity or separate if needed
              totalCDC,
              totalOtherFees: totalOther,
              totalCGT,
              freeCash,
              cashInvestment: netPrincipal,
              totalDeposits,
              netPrincipal,
              reinvestedProfits,
              roi
          }
      };

  }, [portfolioTransactions, groupByBroker, marketPrices]);


  // --- HANDLERS ---
  const handleAddTransaction = (newTx: Omit<Transaction, 'id' | 'portfolioId'>) => {
      const tx: Transaction = {
          ...newTx,
          id: crypto.randomUUID(),
          portfolioId: 'default'
      };
      setTransactions(prev => [...prev, tx]);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
      setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
  };

  const handleDeleteTransaction = (id: string) => {
      if (confirm('Are you sure you want to delete this transaction?')) {
          setTransactions(prev => prev.filter(t => t.id !== id));
      }
  };

  const handleEditClick = (tx: Transaction) => {
      setEditingTransaction(tx);
      setShowAddModal(true);
  };

  const handleAddBroker = (b: Omit<Broker, 'id'>) => {
      const newBroker = { ...b, id: crypto.randomUUID() };
      setBrokers(prev => [...prev, newBroker]);
  };

  const handleUpdateBroker = (b: Broker) => {
      setBrokers(prev => prev.map(old => old.id === b.id ? b : old));
  };

  const handleDeleteBroker = (id: string) => {
      setBrokers(prev => prev.filter(b => b.id !== id));
  };

  const handleSaveApiKey = (key: string) => {
      setUserApiKey(key);
      setGeminiApiKey(key);
  };

  const handleUpdatePrices = (updates: Record<string, number>) => {
      setMarketPrices(prev => ({ ...prev, ...updates }));
  };

  const handleSyncPrices = async () => {
      setIsSyncing(true);
      setPriceError(false);
      setFailedTickers(new Set());
      
      const tickers = Array.from(new Set(holdings.map(h => h.ticker)));
      if (tickers.length === 0) {
          setIsSyncing(false);
          return;
      }

      try {
          const results = await fetchBatchPSXPrices(tickers);
          const updates: Record<string, number> = {};
          const failed = new Set<string>();
          
          tickers.forEach(t => {
              if (results[t]) {
                  updates[t] = results[t].price;
              } else {
                  failed.add(t);
              }
          });
          
          setMarketPrices(prev => ({ ...prev, ...updates }));
          if (failed.size > 0) {
              setFailedTickers(failed);
              setPriceError(true);
          }
      } catch (e) {
          console.error("Sync failed", e);
          setPriceError(true);
      } finally {
          setIsSyncing(false);
      }
  };

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
            onGuestLogin={handleGuestLogin}
            onGoogleLogin={handleLogin}
        />
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative overflow-x-hidden font-sans selection:bg-emerald-200">
        {/* HEADER */}
        <header className="px-4 py-4 md:px-8 md:py-6 flex justify-between items-center max-w-7xl mx-auto">
           <div className="flex items-center gap-2">
              <div className="scale-75 origin-left md:scale-100">
                  <Logo />
              </div>
           </div>
           
           <div className="flex items-center gap-4">
               {driveUser ? (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                      <img src={driveUser.picture} alt="User" className="w-6 h-6 rounded-full" />
                      <span className="text-xs font-bold text-slate-700 hidden md:block">{driveUser.name}</span>
                      {isCloudSyncing && <Loader2 size={12} className="animate-spin text-emerald-500" />}
                  </div>
               ) : (
                  <button onClick={() => setShowLogin(true)} className="text-xs font-bold text-slate-500 hover:text-emerald-600">Sign In</button>
               )}
               {driveUser && (
                   <button onClick={signOutDrive} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title="Sign Out">
                       <LogOut size={18} />
                   </button>
               )}
           </div>
        </header>

        <main className="animate-in fade-in slide-in-from-bottom-5 duration-700 px-4 max-w-7xl mx-auto">
            
            {/* NAVIGATION BAR */}
            <div className="flex justify-center mb-8">
                <div className="bg-white/80 backdrop-blur border border-slate-200 p-1.5 rounded-2xl flex gap-1 shadow-sm">
                    <button 
                        onClick={() => navigate('/dashboard')} 
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${location.pathname === '/dashboard' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                    > 
                        <LayoutDashboard size={18} /> Dashboard 
                    </button>
                    
                    <button 
                        onClick={() => navigate('/realized')} 
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${location.pathname === '/realized' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                    > 
                        <CheckCircle2 size={18} /> Realized Gains 
                    </button>
                    
                    <button 
                        onClick={() => navigate('/history')} 
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${location.pathname === '/history' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                    > 
                        <History size={18} /> History 
                    </button>
                </div>
            </div>

            {/* TOOLBAR */}
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
                    
                    {location.pathname !== '/history' && (
                        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                             <button onClick={() => setGroupByBroker(true)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Separate</button>
                             <button onClick={() => setGroupByBroker(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Combine</button>
                        </div>
                    )}

                    {location.pathname === '/dashboard' && (
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

            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              <Route path="/dashboard" element={
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <Dashboard stats={stats} />
                    <div className="flex flex-col gap-6">
                        <AllocationChart holdings={holdings} />
                        <HoldingsTable holdings={holdings} showBroker={groupByBroker} failedTickers={failedTickers} />
                    </div>
                </div>
              } />
              
              <Route path="/realized" element={
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <RealizedTable trades={realizedTrades} showBroker={groupByBroker} />
                </div>
              } />
              
              <Route path="/history" element={
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TransactionList transactions={portfolioTransactions} onDelete={handleDeleteTransaction} onEdit={handleEditClick} />
                </div>
              } />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>

        </main>

      {/* MODALS */}
      <TransactionForm isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} existingTransactions={transactions} editingTransaction={editingTransaction} brokers={brokers} onManageBrokers={() => setShowBrokerManager(true)} />
      <BrokerManager isOpen={showBrokerManager} onClose={() => setShowBrokerManager(false)} brokers={brokers} onAddBroker={handleAddBroker} onUpdateBroker={handleUpdateBroker} onDeleteBroker={handleDeleteBroker} />
      <ApiKeyManager isOpen={showApiKeyManager} onClose={() => setShowApiKeyManager(false)} apiKey={userApiKey} onSave={handleSaveApiKey} isDriveConnected={!!driveUser} />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />
      <DividendScanner isOpen={showDividendScanner} onClose={() => setShowDividendScanner(false)} transactions={transactions} onAddTransaction={handleAddTransaction} onOpenSettings={() => setShowApiKeyManager(true)} />
    </div>
  );
};

export default App;
