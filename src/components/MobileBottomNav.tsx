import React, { useEffect, useState } from 'react';
import { House, Radar, ChartNoAxesGantt, ChartNoAxesCombined, Newspaper, Menu, X } from 'lucide-react';
import type { AppView } from '../types';
import { marketTabFromLocation, type MarketTab } from '../utils/marketTabRoute';
import '../mobile-bottom-nav.css';

const items = [
  { view: 'DASHBOARD', label: 'Home', Icon: House },
  { view: 'HOLDINGS', label: 'Portfolio', Icon: ChartNoAxesGantt },
  { view: 'SIGNALS', label: 'Scan', Icon: Radar },
  { view: 'MARKETS', label: 'Markets', Icon: ChartNoAxesCombined },
  { view: 'MARKETS', label: 'News', Icon: Newspaper },
  { view: 'PROFILE_SETTINGS', label: 'Menu', Icon: Menu },
] as const;

interface MobileBottomNavProps {
  currentView: AppView;
  onNavigate: (view: AppView, marketTab?: MarketTab) => void;
  isFundPortfolio?: boolean;
  menuOpen?: boolean;
  onOpenMenu: () => void;
}

/** Shortcuts share the app's existing navigation, account gates and portfolio. */
export function MobileBottomNav({ currentView, onNavigate, isFundPortfolio = false, menuOpen = false, onOpenMenu }: MobileBottomNavProps) {
  const [showRadarHelp, setShowRadarHelp] = useState(false);
  const [marketTab, setMarketTab] = useState(() => marketTabFromLocation(location.pathname, location.hash));
  useEffect(() => {
    const update = () => setMarketTab(marketTabFromLocation(location.pathname, location.hash));
    update();
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [currentView]);
  useEffect(() => { setShowRadarHelp(false); }, [currentView, isFundPortfolio, menuOpen]);
  const activeView = currentView === 'HISTORY' || currentView === 'REALIZED' ? 'HOLDINGS'
    : currentView === 'DAILY_SCAN' ? 'SIGNALS' : currentView;

  return <div className="mobile-bottom-dock" data-menu-open={menuOpen || undefined}>
    {showRadarHelp && <div className="mobile-bottom-hint" role="status">
      <span>Scan finds PSX stock signals. Select a PSX portfolio using the selector at the top to open Market Signals.</span>
      <button type="button" aria-label="Dismiss Scan help" onClick={() => setShowRadarHelp(false)}><X size={18} aria-hidden="true" /></button>
    </div>}
    <nav className="mobile-bottom-nav" aria-label="Quick navigation" aria-hidden={menuOpen || undefined}>
      {items.map(({ view, label, Icon }) => <button
        type="button"
        key={label}
        className={view === 'SIGNALS' ? 'mobile-bottom-radar' : undefined}
        aria-current={activeView === view && (view !== 'MARKETS' || (label === 'News' ? marketTab === 'news' : marketTab !== 'news')) ? 'page' : undefined}
        onClick={() => {
          if (view === 'PROFILE_SETTINGS') { onOpenMenu(); return; }
          if (view === 'SIGNALS' && isFundPortfolio) { setShowRadarHelp(true); return; }
          setShowRadarHelp(false);
          onNavigate(view, view === 'MARKETS' ? (label === 'News' ? 'news' : 'overview') : undefined);
        }}
      ><span className="mobile-bottom-icon" aria-hidden="true"><Icon size={21} strokeWidth={2.1} /></span><span className="mobile-bottom-label">{label}</span></button>)}
    </nav>
  </div>;
}
