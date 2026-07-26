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

  X,

  TrendingUp

} from 'lucide-react';



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

    { id: 'REALIZED', label: 'Realized P&L', icon: <TrendingUp size={20} /> },

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

      {/* Mobile Backdrop */}

      {isOpen && (

        <div 

          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"

          onClick={onClose}

        />

      )}



      {/* Sidebar Container */}

      <div className={`

        fixed lg:static inset-y-0 left-0 z-50

        w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800

        transform transition-transform duration-300 ease-in-out

        flex flex-col h-screen

        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}

      `}>

        

        {/* Header / Logo Area */}

        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 shrink-0">

          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">

            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">

              <TrendingUp size={18} strokeWidth={3} />

            </div>

            PSX Tracker

          </h1>

          <button 

            onClick={onClose}

            className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"

          >

            <X size={20} />

          </button>

        </div>



        {/* Navigation Area */}

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 no-scrollbar">

          

          {/* Main Menu */}

          <div className="space-y-1">

            <div className="px-3 mb-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">

              Menu

            </div>

            {mainNavItems.map((item) => (

              <button

                key={item.id}

                onClick={() => handleNavClick(item.id)}

                className={`

                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all

                  ${currentView === item.id 

                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 

                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'

                  }

                `}

              >

                <div className={currentView === item.id ? 'text-emerald-500' : 'text-slate-400'}>

                  {item.icon}

                </div>

                {item.label}

              </button>

            ))}

          </div>



          {/* Settings Menu */}

          <div className="space-y-1 pt-4 border-t border-slate-100 dark:border-slate-800">

            <div className="px-3 mb-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">

              <Settings size={14} /> Settings

            </div>

            {settingsNavItems.map((item) => (

              <button

                key={item.id}

                onClick={() => handleNavClick(item.id)}

                className={`

                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all

                  ${currentView === item.id 

                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100' 

                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'

                  }

                `}

              >

                <div className={currentView === item.id ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}>

                  {item.icon}

                </div>

                {item.label}

              </button>

            ))}

          </div>



        </div>

      </div>

    </>

  );

}; 

