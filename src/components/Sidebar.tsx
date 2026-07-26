import React, { useState } from 'react';
import { AppView } from '../types';
import { 
  LayoutDashboard, History, Activity, Bell, Calculator, 
  Settings, Briefcase, Key, X, ChevronDown, 
  ChevronsLeft, ChevronsRight, LogOut, Save, Loader2,
  FolderOpen, ChartCandlestick, CheckCircle2, Radar, TrendingUp
} from 'lucide-react';
import { Logo } from './ui/Logo';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isOpen: boolean;
  onClose: () => void;
  isSidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  driveUser: any | null;
  onLogin: () => void;
  onLogout: () => void;
  isCloudSyncing: boolean;
  hasApiKeys: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, onViewChange, isOpen, onClose, 
  isSidebarCollapsed, onToggleCollapse, driveUser, onLogin, onLogout, isCloudSyncing, hasApiKeys 
}) => {
  
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

  // RESTORED: All 9 distinct app views correctly mapped
  const mainNavItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={22} /> },
    { id: 'HOLDINGS', label: 'Holdings', icon: <FolderOpen size={22} /> },
    { id: 'STOCKS', label: 'Stock Analyzer', icon: <ChartCandlestick size={22} /> },
    { id: 'REALIZED', label: 'Realized P&L', icon: <CheckCircle2 size={22} /> }, 
    { id: 'HISTORY', label: 'History', icon: <History size={22} /> },
    { id: 'SIGNALS', label: 'Market Signals', icon: <Radar size={22} /> },
    { id: 'ALERTS', label: 'Price Alerts', icon: <Bell size={22} /> },
    { id: 'CALCULATOR', label: 'Fair Value Calc', icon: <Calculator size={22} /> },
    { id: 'SIMULATOR', label: 'Trading Simulator', icon: <TrendingUp size={22} /> },
  ];

  // Settings & Configuration Views
  const settingsNavItems: { id: AppView; label: string; icon: React.ReactNode, alert: boolean }[] = [
    { id: 'BROKERS', label: 'Broker Setup', icon: <Briefcase size={22} />, alert: false },
    { id: 'API_KEYS', label: 'API Keys', icon: <Key size={22} />, alert: !hasApiKeys },
  ];

  const handleNavClick = (id: AppView) => {
    onViewChange(id);
    if (window.innerWidth < 1024) {
      onClose(); // Close mobile sidebar after clicking
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60
        shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]
        transform transition-all duration-300 ease-out
        flex flex-col h-screen
        ${isSidebarCollapsed ? 'w-28' : 'w-64'}
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Header / Logo Area */}
        <div className="relative flex flex-col items-center justify-center p-6 mb-2 border-b border-slate-100 dark:border-slate-800/60 min-h-[120px] shrink-0">
          <div className="flex-shrink-0 origin-center transition-transform duration-300 transform scale-110">
              <Logo />
          </div>
          
          {(!isSidebarCollapsed || isOpen) && (
              <div className="mt-4 animate-in fade-in duration-300">
                  <p className="text-[10px] md:text-[11px] font-bold tracking-wider whitespace-nowrap text-center">
                      <span className="text-slate-700 dark:text-slate-300">KNOW MORE. </span> 
                      <span className="text-cyan-500">EARN MORE.</span>
                  </p>
              </div>
          )}

          <button 
            onClick={onClose}
            className="lg:hidden absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-4 custom-scrollbar">
          
          {/* Main Menu */}
          <div className="space-y-1">
            <div className={`px-3 mb-3 text-[10px] font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ${isSidebarCollapsed && !isOpen ? 'text-center' : ''}`}>
              {(!isSidebarCollapsed || isOpen) && 'Menu'}
            </div>
            {mainNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  title={(isSidebarCollapsed && !isOpen) ? item.label : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    w-full flex items-center ${(isSidebarCollapsed && !isOpen) ? 'justify-center px-0' : 'gap-3 px-3'} py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                    ${isActive 
                      ? 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`flex-shrink-0 transition-colors ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  {(!isSidebarCollapsed || isOpen) && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Settings Menu Accordion */}
          <div className="space-y-1 pt-6 border-t border-slate-100 dark:border-slate-800/60">
            <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className={`w-full flex items-center px-3 mb-2 text-[10px] font-display font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-colors outline-none ${(isSidebarCollapsed && !isOpen) ? 'justify-center' : 'justify-between'}`}
                title="Settings"
            >
                <div className="flex items-center gap-1.5">
                    <Settings size={14} className={!hasApiKeys && !isSettingsExpanded ? "text-rose-500 animate-pulse" : ""} />
                    {(!isSidebarCollapsed || isOpen) && <span>Settings</span>}
                </div>
                {(!isSidebarCollapsed || isOpen) && (
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isSettingsExpanded ? 'rotate-180' : ''}`} />
                )}
            </button>

            <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${isSettingsExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              {settingsNavItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    title={(isSidebarCollapsed && !isOpen) ? item.label : undefined}
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      w-full flex items-center ${(isSidebarCollapsed && !isOpen) ? 'justify-center px-0' : 'gap-3 px-3'} py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                      ${isActive 
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200/50 dark:border-slate-700 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                      }
                    `}
                  >
                    <div className="relative flex-shrink-0">
                        <div className={`transition-colors ${isActive ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                          {item.icon}
                        </div>
                        {item.alert && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>}
                    </div>
                    {(!isSidebarCollapsed || isOpen) && (
                        <span className={`whitespace-nowrap ${item.alert ? 'text-rose-500 font-bold' : ''}`}>
                            {item.label}
                        </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* User Profile & Collapse Area */}
        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4 bg-slate-50/50 dark:bg-[#0f0f0f]/50 shrink-0">
            {driveUser ? (
                <div className="flex flex-col gap-3">
                    <div className={`flex items-center ${(isSidebarCollapsed && !isOpen) ? 'justify-center' : 'gap-3'}`}>
                        {driveUser.picture ? ( 
                            <img src={driveUser.picture} alt="User" className="w-9 h-9 rounded-xl border border-emerald-200 dark:border-emerald-900 flex-shrink-0 shadow-sm" /> 
                        ) : ( 
                            <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold flex-shrink-0 shadow-sm">
                                {driveUser.name?.[0]}
                            </div> 
                        )}
                        
                        {(!isSidebarCollapsed || isOpen) && (
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                    {isCloudSyncing ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Synced
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{driveUser.name}</span>
                            </div>
                        )}
                    </div>
                    {(!isSidebarCollapsed || isOpen) && (
                        <button onClick={onLogout} className="flex items-center gap-2 text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-bold transition-colors w-full px-1">
                            <LogOut size={14} /> Sign Out
                        </button>
                    )}
                </div>
            ) : (
                <button onClick={onLogin} className={`flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 transition-all ${(isSidebarCollapsed && !isOpen) ? 'px-2' : 'px-4 w-full'}`}>
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4 flex-shrink-0" alt="Google" /> 
                    {(!isSidebarCollapsed || isOpen) && <span>Sign in</span>}
                </button>
            )}

            <button 
                onClick={onToggleCollapse}
                className={`w-full flex items-center ${(isSidebarCollapsed && !isOpen) ? 'justify-center px-0' : 'gap-3 px-2'} py-2 text-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors`}
                title="Toggle Sidebar"
            >
                {(isSidebarCollapsed && !isOpen) ? <ChevronsRight size={18} className="flex-shrink-0" /> : <ChevronsLeft size={18} className="flex-shrink-0" />}
                {(!isSidebarCollapsed || isOpen) && <span className="font-medium whitespace-nowrap">Collapse</span>}
            </button>
        </div>

      </div>
    </>
  );
};
