import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// 1. Add these imports
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

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

// ... (Keep existing constants like INITIAL_TRANSACTIONS, DEFAULT_PORTFOLIO, etc.) ...

const App: React.FC = () => {
  // 2. Initialize Hooks
  const navigate = useNavigate();
  const location = useLocation();
  
  // 3. REMOVED: const [currentView, setCurrentView] = useState<AppView>('DASHBOARD');

  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  // ... (Keep all your existing state: brokers, transactions, portfolios, holdings, etc.) ...
  // ... (Keep all your existing useEffects and handlers: handleLogin, performLogout, calculations, etc.) ...

  // --- RENDER GATES (Keep existing) ---
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
      {/* ... (Keep background divs and header) ... */}
      
        <header className="...">
           {/* ... (Keep header content: Logo, User Profile, Portfolio Selector) ... */}
        </header>

        <main className="animate-in fade-in slide-in-from-bottom-5 duration-700">
            
            {/* 4. UPDATED NAVIGATION BAR */}
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

            {/* 5. UPDATED TOOLBAR (Hide Price/Sync buttons if not on Dashboard) */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white/40 p-4 rounded-2xl border border-white/60 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* ... (Keep Add Transaction, Brokers, Scan Dividends, API Key buttons) ... */}
                    <button onClick={() => { setEditingTransaction(null); setShowAddModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"> <Plus size={18} /> Add Transaction </button>
                    <button onClick={() => setShowBrokerManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Briefcase size={18} /> Brokers </button>
                    <button onClick={() => setShowDividendScanner(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"> <Coins size={18} /> Scan Dividends </button>
                    <button onClick={() => setShowApiKeyManager(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2" title="AI Settings"> <Key size={18} className="text-emerald-500" /> <span>API Key</span> </button>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <div className="relative z-20">
                         {/* ... (Keep Filter Broker Dropdown) ... */}
                         <div className="absolute left-3 top-3 text-slate-400 pointer-events-none"><Filter size={16} /></div>
                         <select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value)} className="appearance-none bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 pl-10 pr-10 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer min-w-[160px] shadow-sm transition-colors focus:ring-2 focus:ring-emerald-500/20">
                             <option value="All">All Brokers</option>
                             {uniqueBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                         </select>
                    </div>
                    
                    {/* Hide Combine/Separate button on History page */}
                    {location.pathname !== '/history' && (
                        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                             <button onClick={() => setGroupByBroker(true)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Separate</button>
                             <button onClick={() => setGroupByBroker(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!groupByBroker ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Combine</button>
                        </div>
                    )}

                    {/* Only show Manual Prices / Sync on Dashboard */}
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

            {/* 6. REPLACED CONDITIONAL RENDERING WITH ROUTES */}
            <Routes>
              {/* Default redirect to dashboard */}
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

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>

        </main>
      </div>

      {/* ... (Keep existing Modals: PortfolioModal, TransactionForm, etc.) ... */}
      <TransactionForm isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} existingTransactions={transactions} editingTransaction={editingTransaction} brokers={brokers} onManageBrokers={() => setShowBrokerManager(true)} />
      {/* ... other modals ... */}
      <BrokerManager isOpen={showBrokerManager} onClose={() => setShowBrokerManager(false)} brokers={brokers} onAddBroker={handleAddBroker} onUpdateBroker={handleUpdateBroker} onDeleteBroker={handleDeleteBroker} />
      <ApiKeyManager isOpen={showApiKeyManager} onClose={() => setShowApiKeyManager(false)} apiKey={userApiKey} onSave={handleSaveApiKey} isDriveConnected={!!driveUser} />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />
      <DividendScanner isOpen={showDividendScanner} onClose={() => setShowDividendScanner(false)} transactions={transactions} onAddTransaction={handleAddTransaction} onOpenSettings={() => setShowApiKeyManager(true)} />
    </div>
  );
};

export default App;
