import React, { useState } from 'react';
import { AppView } from '../types';
import { 
  LayoutDashboard, History, PieChart, Activity, Bell, Calculator, 
  LineChart, Settings, Briefcase, Key, X, ChevronDown, 
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

  const settingsNavItems: { id: AppView; label: string; icon: React.ReactNode, alert: boolean }[] = [
    { id: 'BROKERS', label: 'Broker Setup', icon: <Briefcase size={22} />, alert: false },
    { id: 'API_KEYS', label: 'API Keys', icon: <Key size={22} />, alert: !hasApiKeys },
  ];

  const handleNavClick = (id: AppView) => {
    onViewChange(id);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const isCollapsed = isSidebarCollapsed && !isOpen;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container (Fixed Height Issue: using h-[100dvh] instead of h-screen) */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60
        shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]
        transform transition-all duration-300 ease-in-out
        flex flex-col h-[100dvh] overflow-hidden
        ${isCollapsed ? 'w-24' : 'w-64'}
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Header / Logo Area */}
        <div className={`relative flex flex-col items-center justify-center border-b border-slate-100 dark:border-slate-800/60 shrink-0 transition-all duration-300 ${isCollapsed ? 'py-6 min-h-[90px]' : 'p-6 mb-2 min-h-[120px]'}`}>
          
          <div className={`flex-shrink-0 origin-center transition-transform duration-300 transform ${isCollapsed ? 'scale-75' : 'scale-110'}`}>
              <Logo />
          </div>
          
          {!isCollapsed && (
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
            <div className={`mb-3 font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-all ${isCollapsed ? 'text-center text-[9px] px-0' : 'px-3 text-[10px]'}`}>
              {!isCollapsed ? 'Menu' : '—'}
            </div>
            {mainNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    w-full flex items-center py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                    ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}
                    ${isActive 
                      ? 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`flex-shrink-0 transition-colors ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Settings Menu Accordion */}
          <div className="space-y-1 pt-6 border-t border-slate-100 dark:border-slate-800/60">
            <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className={`w-full flex items-center mb-2 font-display font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-all outline-none 
                  ${isCollapsed ? 'justify-center px-0 text-[9px]' : 'justify-between px-3 text-[10px]'}`}
                title="Settings"
            >
                <div className="flex items-center gap-1.5">
                    <Settings size={14} className={!hasApiKeys && !isSettingsExpanded ? "text-rose-500 animate-pulse" : ""} />
                    {!isCollapsed && <span>Settings</span>}
                </div>
                {!isCollapsed && (
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isSettingsExpanded ? 'rotate-180' : ''}`} />
                )}
            </button>

            <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${isSettingsExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              {settingsNavItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    title={isCollapsed ? item.label : undefined}
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      w-full flex items-center py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                      ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}
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
                    {!isCollapsed && (
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

        {/* User Profile & Collapse Area (Fixed padding for bottom cutoff) */}
        <div className={`border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col bg-slate-50/50 dark:bg-[#0f0f0f]/50 shrink-0 transition-all ${isCollapsed ? 'p-3 pb-6 gap-3' : 'p-4 pb-8 gap-4'}`}>
            
            {driveUser ? (
                <div className={`flex ${isCollapsed ? 'flex-col items-center' : 'flex-col'} gap-3`}>
                    
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
                        {driveUser.picture ? ( 
                            <img src={driveUser.picture} alt="User" className="w-10 h-10 rounded-xl border border-emerald-200 dark:border-emerald-900 flex-shrink-0 shadow-sm" /> 
                        ) : ( 
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold flex-shrink-0 shadow-sm">
                                {driveUser.name?.[0]}
                            </div> 
                        )}
                        
                        {!isCollapsed && (
                            <div className="flex flex-col min-w-0 overflow-hidden">
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                    {isCloudSyncing ? <Loader2 size={10} className="animate-spin shrink-0" /> : <Save size={10} className="shrink-0" />} Synced
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{driveUser.name}</span>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={onLogout} 
                        title={isCollapsed ? "Sign Out" : undefined}
                        className={`flex items-center justify-center text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-bold transition-all w-full rounded-xl ${isCollapsed ? 'p-2.5 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'gap-2 px-2 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10'}`}
                    >
                        <LogOut size={18} className="shrink-0" /> 
                        {!isCollapsed && <span>Sign Out</span>}
                    </button>

                </div>
            ) : (
                <button 
                    onClick={onLogin} 
                    title={isCollapsed ? "Sign in with Google" : undefined}
                    className={`flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 transition-all ${isCollapsed ? 'p-3' : 'px-4 py-2.5 w-full'}`}
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5 flex-shrink-0" alt="Google" /> 
                    {!isCollapsed && <span>Sign in</span>}
                </button>
            )}

            <button 
                onClick={onToggleCollapse}
                className={`w-full flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${isCollapsed ? 'p-3' : 'py-3 gap-3'}`}
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
                {isCollapsed ? <ChevronsRight size={22} className="shrink-0" /> : <ChevronsLeft size={22} className="shrink-0" />}
                {!isCollapsed && <span className="font-bold text-sm">Collapse Sidebar</span>}
            </button>
        </div>

      </div>
    </>
  );
};
