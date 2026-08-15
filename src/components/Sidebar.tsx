import React, { useState, useEffect } from 'react';
import { AppView } from '../types';
import {
  LayoutDashboard, History, Bell, Calculator,
  LineChart, Settings, Briefcase, Key, X, ChevronDown,
  ChevronsLeft, ChevronsRight, LogOut, Save, Loader2,
  FolderOpen, ChartCandlestick, CheckCircle2, Radar, TrendingUp, Sparkles, Star, Layers,
  LayoutGrid, Wrench, BarChart3
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

interface Leaf { id: AppView; label: string; icon: React.ReactNode; alert?: boolean; }
interface NavItem {
  id: AppView | 'PROFILE';
  label: string;
  icon: React.ReactNode;
  alert?: boolean;
  children?: Leaf[];
}
interface NavGroup { key: string; label: string; icon: React.ReactNode; gear?: boolean; items: NavItem[]; }

export const Sidebar: React.FC<SidebarProps> = ({
  currentView, onViewChange, isOpen, onClose,
  isSidebarCollapsed, onToggleCollapse, driveUser, onLogin, onLogout, isCloudSyncing, hasApiKeys
}) => {

  const isProfileView = currentView === 'STOCKS' || currentView === 'SECTOR';

  // Which group each view belongs to (so we can auto-open the active one).
  const groupOfView: Record<string, string> = {
    DASHBOARD: 'Menu', HOLDINGS: 'Menu', STOCKS: 'Menu', SECTOR: 'Menu',
    SIGNALS: 'Tools', WATCHLIST: 'Tools', ALERTS: 'Tools', AI_AGENT: 'Tools', SIMULATOR: 'Tools', CALCULATOR: 'Tools',
    REALIZED: 'Reports', HISTORY: 'Reports',
    BROKERS: 'Settings', API_KEYS: 'Settings',
  };

  // Everything collapsed by default — only the group holding the active view is open.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const base = { Menu: false, Tools: false, Reports: false, Settings: false } as Record<string, boolean>;
    const g = groupOfView[currentView];
    if (g) base[g] = true;
    return base;
  });
  const [profileOpen, setProfileOpen] = useState(isProfileView);

  // Keep the active group (and Profile sub-menu) open as the view changes,
  // without forcing the others shut.
  useEffect(() => {
    const g = groupOfView[currentView];
    if (g) setOpenGroups(prev => ({ ...prev, [g]: true }));
    if (isProfileView) setProfileOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isProfileView]);

  const groups: NavGroup[] = [
    {
      key: 'Menu', label: 'Menu', icon: <LayoutGrid size={14} />, items: [
        { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={22} /> },
        { id: 'HOLDINGS', label: 'Holdings', icon: <FolderOpen size={22} /> },
        {
          id: 'PROFILE', label: 'Profile', icon: <ChartCandlestick size={22} />, children: [
            { id: 'STOCKS', label: 'Stocks', icon: <LineChart size={20} /> },
            { id: 'SECTOR', label: 'Sector', icon: <Layers size={20} /> },
          ]
        },
      ]
    },
    {
      key: 'Tools', label: 'Tools', icon: <Wrench size={14} />, items: [
        { id: 'SIGNALS', label: 'Market Signals', icon: <Radar size={22} /> },
        { id: 'WATCHLIST', label: 'Watchlist', icon: <Star size={22} /> },
        { id: 'ALERTS', label: 'Price Alerts', icon: <Bell size={22} /> },
        { id: 'AI_AGENT', label: 'PSX Assistant', icon: <Sparkles size={22} /> },
        { id: 'SIMULATOR', label: 'Trading Simulator', icon: <TrendingUp size={22} /> },
        { id: 'CALCULATOR', label: 'Fair Value Calc', icon: <Calculator size={22} /> },
      ]
    },
    {
      key: 'Reports', label: 'Reports', icon: <BarChart3 size={14} />, items: [
        { id: 'REALIZED', label: 'Realized P&L', icon: <CheckCircle2 size={22} /> },
        { id: 'HISTORY', label: 'History', icon: <History size={22} /> },
      ]
    },
    {
      key: 'Settings', label: 'Settings', icon: <Settings size={14} />, gear: true, items: [
        { id: 'BROKERS', label: 'Broker Setup', icon: <Briefcase size={22} /> },
        { id: 'API_KEYS', label: 'API Keys', icon: <Key size={22} />, alert: !hasApiKeys },
      ]
    },
  ];

  const isCollapsed = isSidebarCollapsed && !isOpen;

  const handleNavClick = (id: AppView) => {
    onViewChange(id);
    if (window.innerWidth < 1024) onClose();
  };

  const toggleGroup = (key: string) => setOpenGroups(g => ({ ...g, [key]: !g[key] }));

  // A single clickable nav row (leaf). `settings` uses the slate active style.
  const NavButton = ({ item, nested = false, settings = false }: { item: Leaf; nested?: boolean; settings?: boolean }) => {
    const isActive = currentView === item.id;
    const activeClass = settings
      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200/50 dark:border-slate-700 shadow-sm'
      : 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm';
    return (
      <button
        title={isCollapsed ? item.label : undefined}
        onClick={() => handleNavClick(item.id)}
        className={`w-full flex items-center py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
          ${isCollapsed ? 'justify-center px-0' : nested ? 'gap-3 px-3 pl-6' : 'gap-3 px-3'}
          ${isActive ? activeClass : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 hover:translate-x-1'}`}
      >
        <div className="relative flex-shrink-0">
          <div className={`transition-colors ${isActive ? (settings ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-500 dark:text-emerald-400') : 'text-slate-400'}`}>
            {item.icon}
          </div>
          {item.alert && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>}
        </div>
        {!isCollapsed && <span className={`whitespace-nowrap ${item.alert ? 'text-rose-500 font-bold' : ''}`}>{item.label}</span>}
      </button>
    );
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
        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-5 custom-scrollbar">

          {isCollapsed ? (
            /* Collapsed: icon-only, but each group header still expands/collapses its icons */
            <div className="space-y-1">
              {groups.map((group, gi) => {
                const open = openGroups[group.key];
                const leaves = group.items.flatMap(it =>
                  it.children ? it.children : [{ id: it.id as AppView, label: it.label, icon: it.icon, alert: it.alert }]
                );
                return (
                  <div key={group.key}>
                    {gi > 0 && <div className="my-1.5 mx-3 border-t border-slate-100 dark:border-slate-800/60" />}
                    {/* Group toggle (icon = section, small chevron shows state) */}
                    <button
                      onClick={() => toggleGroup(group.key)}
                      title={`${group.label} — ${open ? 'collapse' : 'expand'}`}
                      className={`w-full flex items-center justify-center gap-0.5 py-2 rounded-xl transition-all outline-none ${open ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <span className={`relative ${group.gear && !hasApiKeys && !open ? 'text-rose-500 animate-pulse' : ''}`}>{group.icon}</span>
                      <ChevronDown size={11} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {/* Group items (icons) */}
                    <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-[600px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                      {leaves.map(leaf => <NavButton key={leaf.id} item={leaf} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Expanded: collapsible groups */
            groups.map(group => {
              const open = openGroups[group.key];
              const settings = group.key === 'Settings';
              return (
                <div key={group.key} className="space-y-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between px-3 mb-1.5 font-display font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest text-[10px] transition-colors outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`shrink-0 ${group.gear && !hasApiKeys && !open ? 'text-rose-500 animate-pulse' : 'text-slate-400 dark:text-slate-500'}`}>{group.icon}</span>
                      {group.label}
                    </span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Group items */}
                  <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {group.items.map(item => {
                      if (item.children) {
                        // Expandable parent (Profile → Stocks / Sector)
                        const parentActive = isProfileView;
                        return (
                          <div key={item.id}>
                            <button
                              onClick={() => setProfileOpen(o => !o)}
                              className={`w-full flex items-center justify-between py-2.5 px-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none
                                ${parentActive
                                  ? 'bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 shadow-sm'
                                  : 'text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'}`}
                            >
                              <span className="flex items-center gap-3">
                                <span className={`flex-shrink-0 ${parentActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>{item.icon}</span>
                                {item.label}
                              </span>
                              <ChevronDown size={15} className={`transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ease-in-out mt-1 space-y-1 ${profileOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                              {item.children.map(child => <NavButton key={child.id} item={child} nested />)}
                            </div>
                          </div>
                        );
                      }
                      return <NavButton key={item.id} item={item as Leaf} settings={settings} />;
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* User Profile & Collapse Area */}
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
