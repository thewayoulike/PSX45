import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Bell, 
  Target, 
  Calculator, 
  Activity, 
  CheckCircle, 
  History,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Define your navigation items matching the top bar
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stocks', label: 'Stocks', icon: TrendingUp },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'buySignals', label: 'Buy Signals', icon: Target },
    { id: 'fairValue', label: 'Fair Value', icon: Calculator },
    { id: 'simulator', label: 'Simulator', icon: Activity },
    { id: 'realizedGains', label: 'Realized Gains', icon: CheckCircle },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div 
      className={`h-screen bg-black text-gray-400 flex flex-col transition-all duration-300 border-r border-gray-800 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand / Logo Area */}
      <div className="flex items-center gap-3 p-5 mb-4">
        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xl">
          A
        </div>
        {!isCollapsed && <span className="font-bold text-white text-xl tracking-wide">AlphaGen</span>}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-gray-800/60 text-yellow-500 border border-gray-700/50' 
                  : 'hover:bg-gray-800/40 hover:text-gray-200'
              }`}
            >
              <Icon size={20} className="flex-shrink-0" />
              {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: User Profile & Collapse Toggle */}
      <div className="p-4 border-t border-gray-800 space-y-4">
        {/* Mock User Profile */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">
            MA
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Muhammad Afta...</p>
            </div>
          )}
        </div>

        {/* Collapse Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between px-2 py-2 text-sm hover:text-white transition-colors"
        >
          {!isCollapsed && <span>Collapse</span>}
          {isCollapsed ? <ChevronsRight size={18} className="mx-auto" /> : <ChevronsLeft size={18} />}
        </button>
      </div>
    </div>
  );
};
