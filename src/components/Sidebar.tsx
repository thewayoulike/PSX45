import React from 'react';
import { AppView } from '../types';
import { 
  LayoutDashboard, 
  History, 
  PieChart, 
  Activity, 
  Bell, 
  Calculator, 
  LineChart, 
  Settings, 
  Briefcase, 
  Key,
  X
} from 'lucide-react';
import { Logo } from './ui/Logo'; // <-- Restored your custom Logo component

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isOpen, onClose }) => {
  
  // Main Application Views
  const mainNavItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'STOCKS', label: 'Holdings', icon: <PieChart size={20} /> },
    { id: 'REALIZED', label: 'Realized P&L', icon: <Activity size={20} /> }, // Using Activity instead of TrendingUp
    { id: 'HISTORY', label: 'History', icon: <History size={20} /> },
    { id: 'SIGNALS', label: 'Market Signals', icon: <Activity size={20} /> },
    { id: 'ALERTS', label: 'Price Alerts', icon: <Bell size={20} /> },
    { id: 'SIMULATOR', label: 'Trading Simulator', icon: <LineChart size={20} /> },
    { id: 'CALCULATOR', label: 'Fair Value Calc', icon: <Calculator size={20} /> },
  ];

  // Settings & Configuration Views
  const settingsNavItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'BROKERS', label: 'Broker Setup', icon: <Briefcase size={20} /> },
    { id: 'API_KEYS', label: 'API Keys', icon: <Key size={20} /> },
  ];

  const handleNavClick = (id: AppView) => {
    onViewChange(id);
    if (window.innerWidth < 1024) {
      onClose(); // Close mobile sidebar after clicking
    }
  };

  return (
    <>
      {/* Mobile Backdrop with Glassmorphism */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60
        shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]
        transform transition-transform duration-300 ease-out
        flex flex-col h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Header / Logo Area */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          
          {/* Your Custom Logo */}
          <div className="flex-shrink-0 origin-left scale-90">
             <Logo />
          </div>

          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 custom-scrollbar">
          
          {/* Main Menu */}
          <div className="space-y-1">
            <div className="px-3 mb-3 text-[10px] font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Menu
            </div>
            {mainNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                    ${isActive 
                      ? 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`transition-colors ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Settings Menu */}
          <div className="space-y-1 pt-6 border-t border-slate-100 dark:border-slate-800/60">
            <div className="px-3 mb-3 text-[10px] font-display font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Settings size={14} /> Settings
            </div>
            {settingsNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                    ${isActive 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200/50 dark:border-slate-700 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'
                    }
                  `}
                >
                  <div className={`transition-colors ${isActive ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  {item.label}
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </>
  );
};
