import React, { useState } from 'react';
import { AppView } from '../types';
import { 
  LayoutDashboard, History, PieChart, Activity, Bell, Calculator, LineChart, 
  Settings, Briefcase, Key, X, ChevronsLeft, ChevronsRight, LogOut, Save, Loader2
} from 'lucide-react';
import { Logo } from './ui/Logo';
import { DriveUser } from '../services/driveStorage';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  driveUser: DriveUser | null;
  isCloudSyncing: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, onViewChange, isOpen, onClose, 
  isCollapsed, onToggleCollapse, driveUser, isCloudSyncing, onLogin, onLogout 
}) => {
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

  // Main Application Views
  const mainNavItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'STOCKS', label: 'Holdings', icon: <PieChart size={20} /> },
    { id: 'REALIZED', label: 'Realized P&L', icon: <Activity size={20} /> },
    { id: 'HISTORY', label: 'History', icon: <History size={20} /> },
    { id: 'SIGNALS', label: 'Market Signals', icon: <Activity size={20} /> },
    { id: 'ALERTS', label: 'Price Alerts', icon: <Bell size={20} /> },
    { id: 'SIMULATOR', label: 'Trading Simulator', icon: <LineChart size={20} /> },
    { id: 'CALCULATOR', label: 'Fair Value Calc', icon: <Calculator size={20} /> },
  ];

  // Settings & Configuration Views
  const settingsNavItems: { id: any; label: string; icon: React.ReactNode }[] = [
    { id: 'BROKERS', label: 'Broker Setup', icon: <Briefcase size={20} /> },
    { id: 'API_KEYS', label: 'API Keys', icon: <Key size={20} /> },
  ];

  const handleNavClick = (id: any) => {
    onViewChange(id);
    if (window.innerWidth < 1024) onClose();
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
        ${isCollapsed ? 'w-24' : 'w-64'}
        bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60
        shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]
        transform transition-all duration-300 ease-out
        flex flex-col h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Header / Logo Area */}
        <div className="flex flex-col items-center justify-center p-4 border-b border-slate-100 dark:border-slate-800/60 min-h-[120px] shrink-0 relative">
          <button 
            onClick={onClose}
            className="lg:hidden absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className={`origin-center transition-transform duration-300 ${isCollapsed ? 'scale-90' : 'scale-100'}`}>
             <Logo />
          </div>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6 custom-scrollbar">
          
          {/* Main Menu */}
          <div className="space-y-1">
            <div className={`px-3 mb-3 text-[10px] font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ${isCollapsed ? 'text-center' : ''}`}>
              {!isCollapsed ? 'Menu' : '—'}
            </div>
            {mainNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                    ${isActive 
                      ? 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`transition-colors shrink-0 ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Settings Menu */}
          <div className="space-y-1 pt-6 border-t border-slate-100 dark:border-slate-800/60">
            <div className={`px-3 mb-3 text-[10px] font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center ${isCollapsed ? 'justify-center' : 'gap-1.5'}`}>
              <Settings size={14} /> {!isCollapsed && 'Settings'}
            </div>
            {settingsNavItems.map((item) => {
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1
                  `}
                >
                  <div className="transition-colors shrink-0 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300">
                    {item.icon}
                  </div>
                  {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Profile / Auth / Collapse Area */}
        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4 bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          {driveUser ? (
              <div className="flex flex-col gap-3">
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                      {driveUser.picture ? ( 
                          <img src={driveUser.picture} alt="User" className="w-10 h-10 rounded-xl border border-emerald-200 dark:border-emerald-800 flex-shrink-0 shadow-sm" /> 
                      ) : ( 
                          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold flex-shrink-0 shadow-sm">
                              {driveUser.name?.[0]}
                          </div> 
                      )}
                      
                      {!isCollapsed && (
                          <div className="flex flex-col min-w-0">
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-0.5">
                                  {isCloudSyncing ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Synced
                              </span>
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{driveUser.name}</span>
                          </div>
                      )}
                  </div>
                  {!isCollapsed && (
                      <button onClick={onLogout} className="flex items-center justify-center gap-2 text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold transition-colors w-full py-2 rounded-lg">
                          <LogOut size={14} /> Sign Out
                      </button>
                  )}
              </div>
          ) : (
              <button onClick={onLogin} title={isCollapsed ? 'Sign in with Google' : undefined} className={`flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 transition-all ${isCollapsed ? 'px-2' : 'px-4 w-full'}`}>
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4 flex-shrink-0" alt="Google" /> 
                  {!isCollapsed && <span>Sign in</span>}
              </button>
          )}

          <button 
              onClick={onToggleCollapse}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-2'} py-2 text-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mt-2`}
              title="Toggle Sidebar"
          >
              {isCollapsed ? <ChevronsRight size={18} className="flex-shrink-0" /> : <ChevronsLeft size={18} className="flex-shrink-0" />}
              {!isCollapsed && <span className="font-medium whitespace-nowrap">Collapse Menu</span>}
          </button>
        </div>

      </div>
    </>
  );
};
