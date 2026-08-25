import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Transaction, Holding, PortfolioStats, RealizedTrade, Portfolio, PortfolioType, Broker, FoundDividend, EditableTrade } from '../types';
import { Dashboard } from './DashboardStats';
import { HoldingsTable } from './HoldingsTable';
import { AllocationChart } from './AllocationChart';
import { PerformanceChart } from './PerformanceChart';
import { RealizedTable } from './RealizedTable';
import { TransactionList } from './TransactionList';
import { PortfolioSummary } from './PortfolioSummary';
import { TopHoldings } from './TopHoldings';
import { IndexBar } from './IndexBar';
import { BenchmarkPanel } from './BenchmarkPanel';
import { AiAgent } from './AiAgent';
import { Watchlist } from './Watchlist';
import { UpcomingDividends } from './UpcomingDividends';
import { TopMovers } from './TopMovers';
import { BoardMeetings } from './BoardMeetings';
import { DashboardGrid } from './DashboardGrid';
import { DashboardCustomizer } from './DashboardCustomizer';
import { AdminUsers } from './AdminUsers';
import { DashboardLayout, normalizeLayout, DEFAULT_LAYOUT } from './dashboard';
import { TransactionForm } from './TransactionForm';
import { BrokerManager } from './BrokerManager';
import { PriceEditor } from './PriceEditor';
import { DividendScanner } from './DividendScanner';
import { UpcomingEventsScanner } from './UpcomingEventsScanner';
import { ApiKeyManager } from './ApiKeyManager';
import { LoginPage } from './LoginPage';
import { TickerPerformanceList } from './TickerPerformanceList';
import { TickerProfile } from './TickerProfile';
import { TransferModal, firstBrokerHolding } from './TransferModal';
import { TradingSimulator } from './TradingSimulator';
import { FairValueCalculator } from './FairValueCalculator';
import { AlertsPage } from './AlertsPage';
import { MarketSignalScanner } from './MarketSignalScanner';
import { PortfolioInsights } from './PortfolioInsights';
import { Sidebar } from './Sidebar';
import { getSector } from '../services/sectors';
import { fetchBatchPSXPrices, fetchAllPSXPrices, setScrapingApiKey, setWebScrapingAIKey } from '../services/psxData';
import { fetchMufapNavCatalog, loadCachedFundCatalog, ensureFundCatalogLoaded, MutualFundRecord, FUND_CATALOG_STORAGE_KEY } from '../services/mufapData';
import { isFundTicker } from '../utils/fundId';
import { setGeminiApiKey } from '../services/gemini';
import {
  Edit3, Plus, Trash2, PlusCircle, X, RefreshCw, Loader2, Coins,
  Pencil, Layers, ChevronDown, CheckSquare, Square, Menu,
  CalendarClock, ArrowRightLeft, AlertTriangle, LayoutGrid
} from 'lucide-react';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { ThemeToggle } from './ui/ThemeToggle';
import * as Popover from '@radix-ui/react-popover';
import { initDriveAuth, signInWithDrive, clearDriveSession, saveToDrive, loadFromDrive, syncTransactionsToSheet, getGoogleSheetId, DriveUser, hasValidSession, setDriveSessionExpiredHandler } from '../services/driveStorage';
import { getAuthUser, checkApproval, getAccessStatus, AccessStatus, signOutAuth, AppAuthUser } from '../services/auth';
import { PendingApproval } from './PendingApproval';
import { Paywall } from './Paywall';
import { calculateXIRR } from '../utils/finance';

const INITIAL_TRANSACTIONS: Partial<Transaction>[] = [];
const WIPE_FLAG = 'psx_wipe_local_data';

const consumeWipeFlag = () => {
    try {
        if (sessionStorage.getItem(WIPE_FLAG) === '1') {
            sessionStorage.removeItem(WIPE_FLAG);
            return true;
        }
    } catch { /* ignore */ }
    return false;
};

const markWipeFlag = () => {
    try { sessionStorage.setItem(WIPE_FLAG, '1'); } catch { /* ignore */ }
};

const clearPortfolioLocalStorage = () => {
    try {
        const keep = new Set(['psx_theme']);
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('psx_') && !keep.has(k)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
};

const startEmpty = consumeWipeFlag();
const DEFAULT_BROKER: Broker = {
  id: 'default_01',
  name: 'Standard Broker',
  commissionType: 'HIGHER_OF',
  rate1: 0.15,
  rate2: 0.05,
  sstRate: 15,
  isDefault: true
};
const DEFAULT_PORTFOLIO: Portfolio = { id: 'default', name: 'Main Portfolio', defaultBrokerId: 'default_01', type: 'PSX' };

const normalizePortfolios = (list: Portfolio[]): Portfolio[] =>
  (list || []).map(p => ({ ...p, type: p.type || 'PSX' }));

const getPortfolioType = (p?: Portfolio): PortfolioType => p?.type || 'PSX';

type AppView = 'DASHBOARD' | 'HOLDINGS' | 'REALIZED' | 'HISTORY' | 'STOCKS' | 'SECTOR' | 'SIMULATOR' | 'CALCULATOR' | 'ALERTS' | 'SIGNALS' | 'AI_AGENT' | 'WATCHLIST' | 'DASH_CUSTOMIZE' | 'ADMIN_USERS';

// Give every view its own URL (History API — no router dependency).
const VIEW_TO_PATH: Record<string, string> = {
  DASHBOARD: '/',
  HOLDINGS: '/holdings',
  STOCKS: '/stocks',
  SECTOR: '/sector',
  REALIZED: '/realized',
  HISTORY: '/history',
  WATCHLIST: '/watchlist',
  SIGNALS: '/signals',
  ALERTS: '/alerts',
  AI_AGENT: '/assistant',
  SIMULATOR: '/simulator',
  CALCULATOR: '/calculator',
  DASH_CUSTOMIZE: '/dashboard/customize',
  ADMIN_USERS: '/admin/users',
  BROKERS: '/settings/brokers',
  API_KEYS: '/settings/api-keys',
};
const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([v, p]) => [p, v])
);
const viewFromPath = (path: string): AppView => {
  const p = path !== '/' ? path.replace(/\/+$/, '') : '/';
  return (PATH_TO_VIEW[p] as AppView) || 'DASHBOARD';
};

const App: React.FC = () => {
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [googleSheetId, setGoogleSheetId] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  // Supabase email/password auth + owner-approval gate
  const [sbUser, setSbUser] = useState<AppAuthUser | null>(null);
  const [sbApproved, setSbApproved] = useState(false);
  const [sbChecking, setSbChecking] = useState(true);
  const [sbStatus, setSbStatus] = useState<AccessStatus | null>(null);      // access status of the signed-in user
  const [pendingStatus, setPendingStatus] = useState<AccessStatus | null>(null); // access status of a blocked Google user
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>(
      () => (typeof window !== 'undefined' ? viewFromPath(window.location.pathname) : 'DASHBOARD')
  );

  // React to browser back/forward — a /stock/TICKER path opens the profile overlay,
  // any other path selects the matching page. (URL is pushed further below, once
  // viewTicker state exists.)
  useEffect(() => {
      const onPop = () => {
          const path = window.location.pathname;
          const m = path.match(/^\/stock\/([^/]+)/i);
          if (m) {
              setViewTicker(decodeURIComponent(m[1]).toUpperCase());
          } else {
              setViewTicker(null);
              setCurrentView(viewFromPath(path));
          }
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [viewTicker, setViewTicker] = useState<string | null>(() => {
      if (typeof window === 'undefined') return null;
      const m = window.location.pathname.match(/^\/stock\/([^/]+)/i);
      return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  });

  // Push the URL for the current page — or /stock/TICKER when a profile is open.
  useEffect(() => {
      const path = viewTicker
          ? `/stock/${encodeURIComponent(viewTicker)}`
          : (VIEW_TO_PATH[currentView] || '/');
      if (window.location.pathname !== path) {
          window.history.pushState(null, '', path);
      }
  }, [currentView, viewTicker]);

  const [brokers, setBrokers] = useState<Broker[]>(() => {
      if (startEmpty) return [DEFAULT_BROKER];
      try {
          const saved = localStorage.getItem('psx_brokers');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
      } catch (e) { console.error(e); }
      return [DEFAULT_BROKER];
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
      if (startEmpty) return INITIAL_TRANSACTIONS as Transaction[];
      try {
          const saved = localStorage.getItem('psx_transactions');
          if (saved) {
              const parsed = JSON.parse(saved);
              return parsed.filter((t: Transaction) => !t.id.startsWith('auto-cgt-'));
          }
      } catch (e) {}
      return INITIAL_TRANSACTIONS as Transaction[];
  });
  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => {
      if (startEmpty) return [DEFAULT_PORTFOLIO];
      try {
          const saved = localStorage.getItem('psx_portfolios');
          if (saved) return normalizePortfolios(JSON.parse(saved));
      } catch (e) {}
      return [DEFAULT_PORTFOLIO];
  });
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>(() => {
      if (startEmpty) return DEFAULT_PORTFOLIO.id;
      return localStorage.getItem('psx_current_portfolio_id') || DEFAULT_PORTFOLIO.id;
  });
  const [scannerState, setScannerState] = useState<Record<string, FoundDividend[]>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_scanner_state');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });
  const [tradeScanResults, setTradeScanResults] = useState<EditableTrade[]>(() => {
      if (startEmpty) return [];
      try {
          const saved = localStorage.getItem('psx_trade_scan_results');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return [];
  });
  const [performanceHistory, setPerformanceHistory] = useState<Record<string, any[]>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_performance_history');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) return { [currentPortfolioId]: parsed };
              return parsed;
          }
      } catch (e) {}
      return {};
  });
  const [fairValueCache, setFairValueCache] = useState<Record<string, any>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_fair_value_cache');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [portfolioNameInput, setPortfolioNameInput] = useState('');
  const [portfolioBrokerIdInput, setPortfolioBrokerIdInput] = useState('');
  const [portfolioTypeInput, setPortfolioTypeInput] = useState<PortfolioType>('PSX');
  const [fundCatalog, setFundCatalog] = useState<Record<string, MutualFundRecord>>(() => loadCachedFundCatalog());

  useEffect(() => {
      if (Object.keys(fundCatalog).length > 0) return;
      ensureFundCatalogLoaded()
          .then(catalog => { if (Object.keys(catalog).length > 0) setFundCatalog(catalog); })
          .catch(() => { /* sync button still works */ });
  }, [fundCatalog]);
  const [isCombinedView, setIsCombinedView] = useState(false);
  const [combinedPortfolioIds, setCombinedPortfolioIds] = useState<Set<string>>(new Set());
  const [manualPrices, setManualPrices] = useState<Record<string, number>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_manual_prices');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });
  const [watchlist, setWatchlist] = useState<string[]>(() => {
      if (startEmpty) return [];
      try {
          const saved = localStorage.getItem('psx_watchlist');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return [];
  });
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>(() => {
      if (startEmpty) return DEFAULT_LAYOUT;
      try {
          const saved = localStorage.getItem('psx_dashboard_layout');
          if (saved) return normalizeLayout(JSON.parse(saved));
      } catch (e) {}
      return DEFAULT_LAYOUT;
  });
  // Track whether we're on a narrow (mobile) viewport so the dashboard uses the
  // separately-saved mobile layout.
  const [isNarrowViewport, setIsNarrowViewport] = useState<boolean>(
      typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
      const onResize = () => setIsNarrowViewport(window.innerWidth < 1024);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
  }, []);
  // Persist dashboard layout locally whenever it changes (works for guests too).
  useEffect(() => {
      if (skipPersistRef.current) return;
      try { localStorage.setItem('psx_dashboard_layout', JSON.stringify(dashboardLayout)); } catch (e) {}
  }, [dashboardLayout]);
  const [ldcpMap, setLdcpMap] = useState<Record<string, number>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_ldcp_map');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });
  const [listedInMap, setListedInMap] = useState<Record<string, string>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_listed_in_map');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });
  const [priceTimestamps, setPriceTimestamps] = useState<Record<string, string>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_price_timestamps');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });
  const [sectorOverrides, setSectorOverrides] = useState<Record<string, string>>(() => {
      if (startEmpty) return {};
      try {
          const saved = localStorage.getItem('psx_sector_overrides');
          if (saved) return JSON.parse(saved);
      } catch (e) {}
      return {};
  });

  const [userApiKey, setUserApiKey] = useState<string>(() => startEmpty ? '' : (localStorage.getItem('psx_gemini_api_key') || ''));
  const [userScraperKey, setUserScraperKey] = useState<string>(() => startEmpty ? '' : (localStorage.getItem('psx_scraping_api_key') || ''));
  const [userWebScrapingAIKey, setUserWebScrapingAIKey] = useState<string>(() => startEmpty ? '' : (localStorage.getItem('psx_webscraping_ai_key') || ''));

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [totalDividendTax, setTotalDividendTax] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [priceError, setPriceError] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [showDividendScanner, setShowDividendScanner] = useState(false);
  const [showUpcomingScanner, setShowUpcomingScanner] = useState(false);
  const [showBrokerManager, setShowBrokerManager] = useState(false);
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set());

  const isReadyToSave = useRef(false);
  const initialSyncDone = useRef(false);
  const initialFundSyncDone = useRef(false);
  const loadedEmailRef = useRef<string | null>(null); // which Google account's data is currently loaded
  // When the user explicitly picks Guest Mode we must ignore any Google session
  // that silently restores afterwards, otherwise it would auto-log them back in.
  const guestModeRef = useRef(false);
  const skipPersistRef = useRef(false);

  const lastPriceUpdate = useMemo(() => {
      const times = Object.values(priceTimestamps);
      if (times.length === 0) return null;
      return times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [priceTimestamps]);

  const sectorMap = useMemo(() => {
      const map: Record<string, string> = {};
      const allTickers = new Set(transactions.map(t => t.ticker));
      allTickers.forEach(t => {
          map[t] = sectorOverrides[t] || getSector(t);
      });
      return map;
  }, [transactions, sectorOverrides]);

  const resetLocalSession = useCallback(() => {
      skipPersistRef.current = true;
      isReadyToSave.current = false;
      initialSyncDone.current = false;
      initialFundSyncDone.current = false;
      loadedEmailRef.current = null;
      setTransactions([]);
      setPortfolios([DEFAULT_PORTFOLIO]);
      setCurrentPortfolioId(DEFAULT_PORTFOLIO.id);
      setHoldings([]);
      setRealizedTrades([]);
      setManualPrices({});
      setLdcpMap({});
      setListedInMap({});
      setPriceTimestamps({});
      setSectorOverrides({});
      setBrokers([DEFAULT_BROKER]);
      setScannerState({});
      setTradeScanResults([]);
      setPerformanceHistory({});
      setFairValueCache({});
      setWatchlist([]);
      setDashboardLayout(DEFAULT_LAYOUT);
      setUserApiKey('');
      setUserScraperKey('');
      setUserWebScrapingAIKey('');
      setGeminiApiKey(null);
      setScrapingApiKey(null);
      setWebScrapingAIKey(null);
      setDriveUser(null);
      setGoogleSheetId(null);
      setSbUser(null);
      setSbApproved(false);
      setSbStatus(null);
      markWipeFlag();
      clearPortfolioLocalStorage();
      clearDriveSession();
  }, []);

  const performLogout = useCallback(() => {
      guestModeRef.current = false;
      resetLocalSession();
      void signOutAuth();
      setShowLogin(true);
      setIsAuthChecking(false);
      // Allow Guest Mode persist after the empty state has flushed.
      setTimeout(() => { skipPersistRef.current = false; }, 0);
  }, [resetLocalSession]);

  // Idle auto-logout window. 12h keeps you signed in through a normal day of
  // intermittent checking (30m was far too aggressive and wiped the Google
  // Drive session, forcing a fresh Google sign-in on return).
  const IDLE_LOGOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
  useIdleTimer(IDLE_LOGOUT_MS, () => {
      if (driveUser) {
          performLogout();
          alert("Session timed out after 12 hours of inactivity. Data cleared for security.");
      }
  });

  const handleManualLogout = () => { if (window.confirm("Logout and clear local data?")) { performLogout(); } };
  // Explicit Google sign-in — clears guest mode so the auth callback is honoured.
  const handleLogin = () => { guestModeRef.current = false; signInWithDrive(); };

  // Explicit Guest Mode — enter locally and block any silent Google restore.
  const handleGuestLogin = () => {
      guestModeRef.current = true;
      resetLocalSession();
      void signOutAuth();
      setDriveUser(null);
      setIsAuthChecking(false);
      setShowLogin(false);
      setTimeout(() => { skipPersistRef.current = false; }, 0);
  };

  // A Google user who authenticated but isn't approved yet (blocks entry).
  const [accessPendingEmail, setAccessPendingEmail] = useState<string | null>(null);
  const [driveBannerDismissed, setDriveBannerDismissed] = useState(false);

  // Re-check Supabase session + approval (after email login/signup, or "check now").
  const refreshAuthStatus = async () => {
      const u = await getAuthUser();
      setSbUser(u);
      if (u) {
          const st = await getAccessStatus(u.email);
          setSbStatus(st);
          setSbApproved(st.active);
          if (st.active) { guestModeRef.current = false; setShowLogin(false); }
      } else {
          setSbApproved(false);
          setSbStatus(null);
      }
  };

  // "Check now" from the pending screen (covers both email and Google users).
  const refreshPending = async () => {
      if (accessPendingEmail) {
          const st = await getAccessStatus(accessPendingEmail);
          setPendingStatus(st);
          if (st.active) { window.location.reload(); return; } // re-run the Google flow, now with access
          return;
      }
      await refreshAuthStatus();
  };

  const handleAuthSignOut = async () => {
      await signOutAuth();
      resetLocalSession();
      setShowLogin(true);
      setTimeout(() => { skipPersistRef.current = false; }, 0);
  };

  // Full sign-out from the pending screen (clears Google/Drive too).
  const handlePendingSignOut = async () => {
      guestModeRef.current = false;
      resetLocalSession();
      await signOutAuth();
      setAccessPendingEmail(null);
      setShowLogin(true);
      setTimeout(() => { skipPersistRef.current = false; }, 0);
  };

  // Safety net: never leave the app stuck on the boot spinner. If any auth
  // check stalls (network, Google/Supabase lock, blocked request), force the
  // loading gates open after a few seconds so the user at least reaches the
  // app or the login screen instead of an endless loader.
  useEffect(() => {
      const t = setTimeout(() => { setIsAuthChecking(false); setSbChecking(false); }, 5000);
      return () => clearTimeout(t);
  }, []);

  // On load, see if there's an approved Supabase session.
  useEffect(() => {
      (async () => {
          try { await refreshAuthStatus(); } catch (e) { /* ignore */ }
          finally { setSbChecking(false); }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
      if (userApiKey) setGeminiApiKey(userApiKey);
      if (userScraperKey) setScrapingApiKey(userScraperKey);
      if (userWebScrapingAIKey) setWebScrapingAIKey(userWebScrapingAIKey);
  }, [userApiKey, userScraperKey, userWebScrapingAIKey]);

  useEffect(() => {
      if (isCombinedView && combinedPortfolioIds.size === 0 && portfolios.length > 0) {
          setCombinedPortfolioIds(new Set(portfolios.map(p => p.id)));
      }
  }, [isCombinedView, portfolios, combinedPortfolioIds.size]);

  useEffect(() => {
      // If the Drive token expires, log out to the login screen instead of
      // auto-popping Google. The user signs back in when they want to resume.
      setDriveSessionExpiredHandler(() => {
          setDriveUser(null);
          setGoogleSheetId(null);
          setIsCloudSyncing(false);
          setShowLogin(true);
      });
      initDriveAuth(async (user) => {
          // User chose Guest Mode — ignore a silently-restored Google session.
          if (guestModeRef.current) { setIsAuthChecking(false); return; }

          // Gate Google sign-in by owner approval + subscription (same allowlist).
          const st = await getAccessStatus(user.email, user.name, true);
          setSbStatus(st);
          if (!st.active) {
              setAccessPendingEmail(user.email);
              setPendingStatus(st);
              setDriveUser(null);
              setIsAuthChecking(false);
              setShowLogin(true);
              return; // don't enter the app until approved / paid
          }

          setAccessPendingEmail(null);
          setDriveUser(user);
          setIsAuthChecking(false);
          setShowLogin(false);

          // ---- Account-switch safety ----
          // If a DIFFERENT Google account just signed in, wipe the previous
          // account's in-memory + cached portfolio BEFORE loading this account's
          // Drive, and block auto-save until the load finishes. Otherwise the old
          // account's data can be written into the new account's Drive file.
          if (loadedEmailRef.current && loadedEmailRef.current !== user.email) {
              isReadyToSave.current = false;
              initialSyncDone.current = false;
              initialFundSyncDone.current = false;
              setTransactions([]); setPortfolios([DEFAULT_PORTFOLIO]); setCurrentPortfolioId(DEFAULT_PORTFOLIO.id);
              setHoldings([]); setRealizedTrades([]);
              setManualPrices({}); setLdcpMap({}); setListedInMap({}); setPriceTimestamps({});
              setSectorOverrides({}); setBrokers([DEFAULT_BROKER]); setScannerState({}); setTradeScanResults([]);
              setPerformanceHistory({}); setFairValueCache({}); setWatchlist([]);
              setUserApiKey(''); setUserScraperKey(''); setUserWebScrapingAIKey('');
              setGeminiApiKey(null); setScrapingApiKey(null); setWebScrapingAIKey(null);
              try {
                  ['psx_transactions', 'psx_portfolios', 'psx_current_portfolio_id', 'psx_gemini_api_key', 'psx_scraping_api_key', 'psx_webscraping_ai_key'].forEach(k => localStorage.removeItem(k));
              } catch { /* ignore */ }
          }
          loadedEmailRef.current = user.email;

          getGoogleSheetId().then(id => setGoogleSheetId(id));
          setIsCloudSyncing(true);
          try {
              const cloudData = await loadFromDrive();
              if (cloudData) {
                  if (cloudData.portfolios) setPortfolios(normalizePortfolios(cloudData.portfolios));
                  if (cloudData.transactions) {
                      const cleanTx = (cloudData.transactions as Transaction[]).filter(t => !t.id.startsWith('auto-cgt-'));
                      setTransactions(cleanTx);
                  }
                  if (cloudData.manualPrices) setManualPrices(cloudData.manualPrices);
                  if (Array.isArray(cloudData.watchlist)) setWatchlist(cloudData.watchlist);
                  if (cloudData.ldcpMap) setLdcpMap(cloudData.ldcpMap);
                  if (cloudData.priceTimestamps) setPriceTimestamps(cloudData.priceTimestamps);
                  if (cloudData.currentPortfolioId) setCurrentPortfolioId(cloudData.currentPortfolioId);
                  if (cloudData.sectorOverrides) setSectorOverrides(prev => ({ ...prev, ...cloudData.sectorOverrides }));
                  if (cloudData.scannerState) setScannerState(cloudData.scannerState);
                  if (cloudData.performanceHistory) setPerformanceHistory(cloudData.performanceHistory);
                  if (cloudData.fairValueCache) setFairValueCache(cloudData.fairValueCache);
                  if (cloudData.fundCatalog) {
                      setFundCatalog(cloudData.fundCatalog);
                      try { localStorage.setItem(FUND_CATALOG_STORAGE_KEY, JSON.stringify(cloudData.fundCatalog)); } catch { /* ignore */ }
                  }

                  if (cloudData.brokers && Array.isArray(cloudData.brokers) && cloudData.brokers.length > 0) {
                      setBrokers(cloudData.brokers);
                      localStorage.setItem('psx_brokers', JSON.stringify(cloudData.brokers));
                  }

                  if (cloudData.geminiApiKey) {
                      setUserApiKey(cloudData.geminiApiKey);
                      setGeminiApiKey(cloudData.geminiApiKey);
                      localStorage.setItem('psx_gemini_api_key', cloudData.geminiApiKey);
                  }
                  if (cloudData.scrapingApiKey) {
                      setUserScraperKey(cloudData.scrapingApiKey);
                      setScrapingApiKey(cloudData.scrapingApiKey);
                      localStorage.setItem('psx_scraping_api_key', cloudData.scrapingApiKey);
                  }
                  if (cloudData.webScrapingAIKey) {
                      setUserWebScrapingAIKey(cloudData.webScrapingAIKey);
                      setWebScrapingAIKey(cloudData.webScrapingAIKey);
                      localStorage.setItem('psx_webscraping_ai_key', cloudData.webScrapingAIKey);
                  }
              }
          } catch (e) {
              console.error("Drive Load Error", e);
          } finally {
              setIsCloudSyncing(false);
              isReadyToSave.current = true;
          }
      });
      if (!hasValidSession()) { setIsAuthChecking(false); setShowLogin(true); }
  }, []);

  const handleSaveApiKey = (geminiKey: string, scraperKey: string, webAIKey: string) => {
      setUserApiKey(geminiKey); setUserScraperKey(scraperKey); setUserWebScrapingAIKey(webAIKey);
      setGeminiApiKey(geminiKey); setScrapingApiKey(scraperKey); setWebScrapingAIKey(webAIKey);
      localStorage.setItem('psx_gemini_api_key', geminiKey);
      localStorage.setItem('psx_scraping_api_key', scraperKey);
      localStorage.setItem('psx_webscraping_ai_key', webAIKey);
      if (driveUser) {
          saveToDrive({
              transactions, portfolios, currentPortfolioId, manualPrices, ldcpMap, priceTimestamps, brokers,
              sectorOverrides, scannerState, performanceHistory, fairValueCache, watchlist, geminiApiKey: geminiKey, scrapingApiKey: scraperKey, webScrapingAIKey: webAIKey
          });
      }
  };

  const handleAddToWatchlist = (ticker: string) => {
      const t = ticker.trim().toUpperCase();
      if (!t) return;
      setWatchlist(prev => (prev.includes(t) ? prev : [...prev, t]));
  };
  const handleRemoveFromWatchlist = (ticker: string) => {
      const t = ticker.toUpperCase();
      setWatchlist(prev => prev.filter(x => x.toUpperCase() !== t));
  };

  const handleAddBroker = (newBroker: Omit<Broker, 'id'>) => { const id = Date.now().toString(); const updatedBrokers = [...brokers, { ...newBroker, id }]; setBrokers(updatedBrokers); };
  const handleUpdateBroker = (updated: Broker) => { const updatedBrokers = brokers.map(b => b.id === updated.id ? updated : b); setBrokers(updatedBrokers); };
  const handleDeleteBroker = (id: string) => { if (window.confirm("Delete this broker?")) { const updatedBrokers = brokers.filter(b => b.id !== id); setBrokers(updatedBrokers); } };

  // Monotonic add-time stamp so same-day trades keep the exact order they were
  // entered (Date.now() can repeat within a ms on bulk adds; we bump past it).
  const seqRef = useRef<number>(0);
  const nextCreatedAt = () => { const t = Date.now(); seqRef.current = t > seqRef.current ? t : seqRef.current + 1; return new Date(seqRef.current).toISOString(); };
  const handleAddTransaction = (txData: Omit<Transaction, 'id' | 'portfolioId'>) => {
      const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);
      if (!currentPortfolio) return;
      const brokerToUse = brokers.find(b => b.id === currentPortfolio.defaultBrokerId);
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
      const newTx: Transaction = { ...txData, id: newId, portfolioId: currentPortfolioId, brokerId: currentPortfolio.defaultBrokerId, broker: brokerToUse?.name || 'Unknown', createdAt: nextCreatedAt() };
      setTransactions(prev => [...prev, newTx]);
  };

  const handleTransferStock = (ticker: string, quantity: number, destPortfolioId: string, date: string, sourceBroker?: string) => {
      const sourcePortfolio = portfolios.find(p => p.id === currentPortfolioId);
      const destPortfolio = portfolios.find(p => p.id === destPortfolioId);
      const holding = (sourceBroker
          ? holdings.find(h => h.ticker === ticker && h.broker === sourceBroker)
          : undefined) || firstBrokerHolding(ticker, holdings, brokers);

      if (!sourcePortfolio || !destPortfolio || !holding) return;
      const transferPrice = holding.avgPrice;
      const sourceBrokerName = holding.broker || (sourcePortfolio.defaultBrokerId ? brokers.find(b => b.id === sourcePortfolio.defaultBrokerId)?.name : 'Transfer');
      const sourceBrokerId = brokers.find(b => b.name === sourceBrokerName)?.id || sourcePortfolio.defaultBrokerId;
      const transferId = Date.now().toString();
      const transferOut: Transaction = {
          id: `tx-out-${transferId}`,
          createdAt: nextCreatedAt(),
          portfolioId: currentPortfolioId,
          type: 'TRANSFER_OUT',
          ticker,
          quantity,
          price: transferPrice,
          date,
          broker: sourceBrokerName,
          brokerId: sourceBrokerId,
          commission: 0, tax: 0, cdcCharges: 0, otherFees: 0,
          notes: `Transfer to ${destPortfolio.name}`
      };
      const transferIn: Transaction = {
          id: `tx-in-${transferId}`,
          createdAt: nextCreatedAt(),
          portfolioId: destPortfolioId,
          type: 'TRANSFER_IN',
          ticker,
          quantity,
          price: transferPrice,
          date,
          broker: destPortfolio.defaultBrokerId ? (brokers.find(b => b.id === destPortfolio.defaultBrokerId)?.name) : 'Transfer',
          brokerId: destPortfolio.defaultBrokerId,
          commission: 0, tax: 0, cdcCharges: 0, otherFees: 0,
          notes: `Transfer from ${sourcePortfolio.name}`
      };
      setTransactions(prev => [...prev, transferOut, transferIn]);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => { setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t)); setEditingTransaction(null); };
  // Fix an out-of-sequence same-day SELL: stamp it 'now' so it sorts after every
  // same-day BUY (which have earlier/blank timestamps), resolving the warning.
  const handleFixSequence = (txId: string) => {
      setTransactions(prev => prev.map(t => t.id === txId ? { ...t, createdAt: nextCreatedAt() } : t));
  };
  const handleDeleteTransaction = (id: string) => { if (window.confirm("Are you sure you want to delete this transaction?")) { setTransactions(prev => prev.filter(t => t.id !== id)); } };
  const handleDeleteTransactions = (ids: string[]) => { if (window.confirm(`Are you sure you want to delete ${ids.length} selected transactions?`)) { setTransactions(prev => prev.filter(t => !ids.includes(t.id))); } };
  const handleEditClick = (tx: Transaction) => { setEditingTransaction(tx); setShowAddModal(true); };
  const handleUpdatePrices = (newPrices: Record<string, number>) => { setManualPrices(prev => ({ ...prev, ...newPrices })); const now = new Date().toISOString(); const newTimestamps: Record<string, string> = {}; Object.keys(newPrices).forEach(k => newTimestamps[k] = now); setPriceTimestamps(prev => ({ ...prev, ...newTimestamps })); };
  const handleScannerUpdate = (results: FoundDividend[]) => { setScannerState(prev => ({ ...prev, [currentPortfolioId]: results })); };
  const handleUpdateTradeScanResults = (results: EditableTrade[]) => { setTradeScanResults(results); };
  const openCreatePortfolioModal = () => {
      setEditingPortfolioId(null);
      setPortfolioNameInput('');
      setPortfolioBrokerIdInput('');
      setPortfolioTypeInput('PSX');
      setIsPortfolioModalOpen(true);
  };
  const openEditPortfolioModal = () => {
      const current = portfolios.find(p => p.id === currentPortfolioId);
      if (current) {
          setEditingPortfolioId(current.id);
          setPortfolioNameInput(current.name);
          setPortfolioBrokerIdInput(current.defaultBrokerId);
          setPortfolioTypeInput(getPortfolioType(current));
          setIsPortfolioModalOpen(true);
      }
  };

  const handleSavePortfolio = (e: React.FormEvent) => {
      e.preventDefault();
      if (!portfolioNameInput.trim()) { alert("Portfolio Name is required"); return; }
      if (!portfolioBrokerIdInput) { alert("A Default Broker is required for every portfolio."); return; }
      if (editingPortfolioId) {
          setPortfolios(prev => prev.map(p => p.id === editingPortfolioId
              ? { ...p, name: portfolioNameInput.trim(), defaultBrokerId: portfolioBrokerIdInput, type: portfolioTypeInput }
              : p));
      } else {
          const newId = Date.now().toString();
          setPortfolios(prev => [...prev, {
              id: newId,
              name: portfolioNameInput.trim(),
              defaultBrokerId: portfolioBrokerIdInput,
              type: portfolioTypeInput,
          }]);
          setCurrentPortfolioId(newId);
      }
      setPortfolioNameInput('');
      setPortfolioBrokerIdInput('');
      setPortfolioTypeInput('PSX');
      setEditingPortfolioId(null);
      setIsPortfolioModalOpen(false);
  };

  const handleDeletePortfolio = () => {
      if (portfolios.length === 1) return alert("You cannot delete the last portfolio.");
      if (window.confirm("Are you sure? This will delete ALL transactions in this portfolio.")) {
          const idToDelete = currentPortfolioId;
          setCurrentPortfolioId(portfolios.find(p => p.id !== idToDelete)?.id || portfolios[0].id);
          setPortfolios(prev => prev.filter(p => p.id !== idToDelete));
          setTransactions(prev => prev.filter(t => t.portfolioId !== idToDelete));
          setScannerState(prev => { const newState = { ...prev }; delete newState[idToDelete]; return newState; });
          setIsPortfolioModalOpen(false);
      }
  };

  const handleTogglePortfolioSelection = (id: string) => { const newSet = new Set(combinedPortfolioIds); if (newSet.has(id)) { if (newSet.size > 1) newSet.delete(id); } else { newSet.add(id); } setCombinedPortfolioIds(newSet); };
  const handleSelectAllPortfolios = () => { setCombinedPortfolioIds(new Set(portfolios.map(p => p.id))); };

  const handleSyncPrices = useCallback(async () => {
      // Sync prices for the ENTIRE PSX market in a single request. The market-watch
      // board already lists every symbol, so this prices your holdings, your closed
      // positions, AND any stock you've never traded — so any profile you open has a
      // live price.
      setIsSyncing(true);
      setPriceError(false);
      setFailedTickers(new Set());

      try {
          const newResults = await fetchAllPSXPrices();
          const marketTickers = Object.keys(newResults);
          console.log(`[App.tsx] PSX market sync: ${marketTickers.length} symbols`);

          const validUpdates: Record<string, number> = {};
          const ldcpUpdates: Record<string, number> = {};
          const newSectors: Record<string, string> = {};
          const listedInUpdates: Record<string, string> = {};
          const now = new Date().toISOString();
          const timestampUpdates: Record<string, string> = {};

          marketTickers.forEach(ticker => {
              const data = newResults[ticker];
              if (data && data.price > 0) {
                  validUpdates[ticker] = data.price;
                  timestampUpdates[ticker] = now;
                  if (data.ldcp > 0) ldcpUpdates[ticker] = data.ldcp;
                  if (data.sector && data.sector !== 'Unknown Sector') {
                      newSectors[ticker] = data.sector;
                  }
                  if (data.listedIn) {
                      listedInUpdates[ticker] = data.listedIn;
                  }
              }
          });

          if (Object.keys(validUpdates).length > 0) {
              setManualPrices(prev => ({ ...prev, ...validUpdates }));
              setLdcpMap(prev => ({ ...prev, ...ldcpUpdates }));
              setPriceTimestamps(prev => ({ ...prev, ...timestampUpdates }));
          }

          if (Object.keys(newSectors).length > 0) {
              setSectorOverrides(prev => ({ ...prev, ...newSectors }));
          }

          if (Object.keys(listedInUpdates).length > 0) {
              setListedInMap(prev => ({ ...prev, ...listedInUpdates }));
          }

          // If the whole board came back empty, the fetch/proxy failed — that's a real error.
          if (marketTickers.length === 0) {
              setPriceError(true);
          } else {
              // Otherwise only warn about stocks you CURRENTLY hold that weren't on the
              // board (suspended / delisted / renamed). Everything else is expected.
              const failedHoldings = new Set(
                  holdings.map(h => h.ticker).filter(t => t && !(validUpdates[t] > 0))
              );
              if (failedHoldings.size > 0) {
                  setFailedTickers(failedHoldings);
                  setPriceError(true);
              }
          }
      } catch (e) {
          console.error(e);
          setPriceError(true);
      } finally {
          setIsSyncing(false);
      }
  }, [holdings]);

  const handleSyncFundNav = useCallback(async () => {
      setIsSyncing(true);
      setPriceError(false);
      setFailedTickers(new Set());

      try {
          const { catalog } = await fetchMufapNavCatalog();
          setFundCatalog(catalog);

          const navUpdates: Record<string, number> = {};
          const sectorUpdates: Record<string, string> = {};
          const now = new Date().toISOString();
          const timestampUpdates: Record<string, string> = {};

          Object.values(catalog).forEach(f => {
              navUpdates[f.id] = f.nav;
              sectorUpdates[f.id] = f.category;
              timestampUpdates[f.id] = now;
          });

          setManualPrices(prev => {
              const ldcpUpdates: Record<string, number> = {};
              Object.keys(navUpdates).forEach(id => {
                  if (prev[id] > 0 && prev[id] !== navUpdates[id]) ldcpUpdates[id] = prev[id];
              });
              if (Object.keys(ldcpUpdates).length > 0) {
                  setLdcpMap(p => ({ ...p, ...ldcpUpdates }));
              }
              return { ...prev, ...navUpdates };
          });
          setSectorOverrides(prev => ({ ...prev, ...sectorUpdates }));
          setPriceTimestamps(prev => ({ ...prev, ...timestampUpdates }));

          const heldFundIds = holdings.filter(h => isFundTicker(h.ticker)).map(h => h.ticker);
          const failed = [...new Set(heldFundIds)].filter(id => !(navUpdates[id] > 0));
          if (failed.length > 0) {
              setFailedTickers(new Set(failed));
              setPriceError(true);
          }
      } catch (e) {
          console.error(e);
          setPriceError(true);
      } finally {
          setIsSyncing(false);
      }
  }, [holdings]);

  useEffect(() => {
      if (!driveUser || holdings.length === 0) return;
      const psxHoldings = holdings.filter(h => !isFundTicker(h.ticker));
      if (psxHoldings.length === 0) return;
      if (!initialSyncDone.current) {
          handleSyncPrices();
          initialSyncDone.current = true;
      }
      const interval = setInterval(() => {
          handleSyncPrices();
      }, 5 * 60 * 1000);
      return () => clearInterval(interval);
  }, [driveUser, holdings.length, handleSyncPrices]);

  useEffect(() => {
      const hasFundHoldings = holdings.some(h => isFundTicker(h.ticker));
      const hasFundPortfolio = portfolios.some(p => getPortfolioType(p) === 'MUTUAL_FUND');
      if (!hasFundHoldings && !hasFundPortfolio) return;
      if (!initialFundSyncDone.current) {
          handleSyncFundNav();
          initialFundSyncDone.current = true;
      }
      const interval = setInterval(() => {
          handleSyncFundNav();
      }, 6 * 60 * 60 * 1000);
      return () => clearInterval(interval);
  }, [holdings.length, portfolios.length, handleSyncFundNav]);

  useEffect(() => {
      if (brokers.length === 0) return;
      const generateFees = () => {
          let newTransactions: Transaction[] = [];
          brokers.forEach(broker => {
              if (!broker.annualFee || !broker.feeStartDate || broker.annualFee <= 0) return;
              let nextDueDate = new Date(broker.feeStartDate);
              nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
              const today = new Date();
              while (nextDueDate <= today) {
                  const feeYear = nextDueDate.getFullYear();
                  const txId = `auto-fee-${broker.id}-${feeYear}`;
                  const exists = transactions.some(t => t.id === txId);
                  if (!exists) {
                      const feeDateStr = nextDueDate.toISOString().split('T')[0];
                      const newTx: Transaction = { id: txId, portfolioId: currentPortfolioId, ticker: 'ANNUAL FEE', type: 'ANNUAL_FEE', quantity: 1, price: broker.annualFee, date: feeDateStr, broker: broker.name, brokerId: broker.id, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, notes: `Annual Broker Fee (${feeYear})`, createdAt: new Date(feeDateStr + 'T00:00:00Z').toISOString() };
                      newTransactions.push(newTx);
                  }
                  nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
              }
          });
          if (newTransactions.length > 0) {
              setTransactions(prev => [...prev, ...newTransactions]);
          }
      };
      generateFees();
  }, [brokers, currentPortfolioId]);

  useEffect(() => {
      if (portfolios.length > 0 && !portfolios.find(p => p.id === currentPortfolioId)) {
          setCurrentPortfolioId(portfolios[0].id);
      }
  }, [portfolios, currentPortfolioId]);

  const portfolioTransactions = useMemo(() => {
      if (isCombinedView) return transactions.filter(t => combinedPortfolioIds.has(t.portfolioId));
      return transactions.filter(t => t.portfolioId === currentPortfolioId);
  }, [transactions, currentPortfolioId, isCombinedView, combinedPortfolioIds]);

  const stats: PortfolioStats = useMemo(() => {
    let totalValue = 0; let totalCost = 0; let totalCommission = 0; let totalSalesTax = 0; let dividendSum = 0; let divTaxSum = 0; let totalCDC = 0; let totalOtherFees = 0; let totalCGT = 0; let totalDeposits = 0; let totalWithdrawals = 0; let historyPnL = 0; let totalReinvest = 0;
    let operationalExpenses = 0;
    let dailyPL = 0;
    let totalAdjustments = 0;
    holdings.forEach(h => {
        totalValue += h.quantity * h.currentPrice;
        const roundedAvg = Math.round(h.avgPrice * 100) / 100;
        totalCost += h.quantity * roundedAvg;
        const ldcp = ldcpMap[h.ticker] || h.currentPrice;
        dailyPL += (h.currentPrice - ldcp) * h.quantity;
    });

    let realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);

    const events: { date: string, type: 'IN' | 'OUT' | 'PROFIT' | 'LOSS', amount: number, originalIndex: number, kind?: 'capital' | 'reinvest', bucket?: 'realized' }[] = [];
    const txIndexMap = new Map<string, number>();
    portfolioTransactions.forEach((t, idx) => txIndexMap.set(t.id, idx));
    portfolioTransactions.forEach((t, idx) => {
        totalCommission += (t.commission || 0); totalCDC += (t.cdcCharges || 0); totalOtherFees += (t.otherFees || 0);

        if (t.type === 'DEPOSIT') {
            totalDeposits += t.price;
            events.push({ date: t.date, type: 'IN', amount: t.price, originalIndex: idx });
        }
        else if (t.type === 'WITHDRAWAL') {
            totalWithdrawals += t.price;
            events.push({ date: t.date, type: 'OUT', amount: t.price, originalIndex: idx });
        }
        else if (t.type === 'ANNUAL_FEE') {
            operationalExpenses += t.price;
            events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx });
        }
        else if (t.type === 'OTHER') {
            if (t.category === 'OTHER_TAX' || t.category === 'CDC_CHARGE') {
                operationalExpenses += Math.abs(t.price);
                if (t.category === 'CDC_CHARGE') totalCDC += Math.abs(t.price);
                events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
            } else {
                totalAdjustments += t.price;
                if (t.price >= 0) {
                    events.push({ date: t.date, type: 'PROFIT', amount: t.price, originalIndex: idx });
                } else {
                    events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
                }
            }
        }
        else if (t.type === 'DIVIDEND') {
            const netDiv = (t.quantity * t.price) - (t.tax || 0) - (t.otherFees || 0);
            dividendSum += netDiv;
            divTaxSum += (t.tax || 0);
            if (netDiv >= 0) events.push({ date: t.date, type: 'PROFIT', amount: netDiv, originalIndex: idx });
        }
        else if (t.type === 'DIVIDEND_REINVEST') {
            // A dividend kept in the portfolio: still counts as dividend income,
            // adds spendable cash, and is added to the invested base (reinvest bucket).
            const amt = t.price;
            totalReinvest += amt;
            dividendSum += amt;
            events.push({ date: t.date, type: 'IN', amount: amt, originalIndex: idx, kind: 'reinvest' });
        }
        else if (t.type === 'TAX') {
            totalCGT += t.price;
            events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx, bucket: 'realized' });
        }
        else if (t.type === 'HISTORY') {
            totalCGT += (t.tax || 0);
            historyPnL += t.price;

            if (t.price >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.price, originalIndex: idx });
            else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
        }
        else if (t.type === 'TRANSFER_IN') {
            events.push({ date: t.date, type: 'IN', amount: t.price * t.quantity, originalIndex: idx });
        }
        else if (t.type === 'TRANSFER_OUT') {
            events.push({ date: t.date, type: 'OUT', amount: t.price * t.quantity, originalIndex: idx });
        }
        else {
            totalSalesTax += (t.tax || 0);
        }
    });

    realizedTrades.forEach((t) => {
        const originalIdx = txIndexMap.get(t.id) ?? 999999;
        if (t.profit >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.profit, originalIndex: originalIdx, bucket: 'realized' });
        else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.profit), originalIndex: originalIdx, bucket: 'realized' });
    });
    events.sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.originalIndex - b.originalIndex;
    });
    const netRealizedPL = realizedPL - totalCGT;
    let runningCapital = 0;
    let runningReinvest = 0;
    let peakInvested = 0;
    events.forEach(e => {
        if (e.type === 'IN') {
            if (e.kind === 'reinvest') runningReinvest += e.amount;
            else runningCapital += e.amount;
            const total = runningCapital + runningReinvest;
            if (total > peakInvested) peakInvested = total;
        }
        else if (e.type === 'OUT') {
            let out = e.amount;
            const fromReinvest = Math.min(out, Math.max(0, runningReinvest));
            runningReinvest -= fromReinvest;
            out -= fromReinvest;
            runningCapital -= out;
        }
    });
    // Net Invested = capital − withdrawals, where a withdrawal is funded first from
    // TOTAL realized gain (net of CGT), then reinvested dividends, then capital.
    // Only the capital-funded portion of withdrawals reduces Net Invested — so
    // cashing out your gains leaves Net Invested unchanged.
    let wLeft = totalWithdrawals;
    wLeft -= Math.min(wLeft, Math.max(0, netRealizedPL));            // realized gain first
    const reinvestUsed = Math.min(wLeft, Math.max(0, totalReinvest));
    wLeft -= reinvestUsed;                                           // then reinvested dividends
    const capitalRemaining = totalDeposits - wLeft;                 // then capital
    const reinvestRemaining = Math.max(0, totalReinvest - reinvestUsed);
    const netPrincipal = Math.max(0, capitalRemaining + reinvestRemaining);
    const peakNetPrincipal = peakInvested;
    const dividendReinvested = reinvestRemaining;
    let tradingCashFlow = 0;
    portfolioTransactions.forEach(t => {
        const val = t.price * t.quantity;
        const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0);
        if (t.type === 'BUY') tradingCashFlow -= (val + fees);
        else if (t.type === 'SELL') tradingCashFlow += (val - fees);
    });

    let cashIn = totalDeposits + totalReinvest;
    let cashOut = totalWithdrawals + totalCGT + operationalExpenses;
    const freeCash = cashIn - cashOut + tradingCashFlow + historyPnL + totalAdjustments;

    const totalNetReturn = netRealizedPL + (totalValue - totalCost) + dividendSum - operationalExpenses + totalAdjustments;

    // Total Return / ROI are measured against PEAK capital (the most you ever had
    // invested), so cashing out gains/capital doesn't inflate the percentage.
    const roiDenominator = peakNetPrincipal > 0 ? peakNetPrincipal : (netPrincipal > 0 ? netPrincipal : 1);
    const roi = (totalNetReturn / roiDenominator) * 100;

    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
    const cashFlowsForXIRR: { amount: number, date: Date }[] = [];
    portfolioTransactions.forEach(t => {
        if (t.type === 'DEPOSIT') {
             cashFlowsForXIRR.push({ amount: -Math.abs(t.price), date: new Date(t.date) });
        } else if (t.type === 'WITHDRAWAL') {
             cashFlowsForXIRR.push({ amount: Math.abs(t.price), date: new Date(t.date) });
        } else if (t.type === 'TRANSFER_IN') {
             cashFlowsForXIRR.push({ amount: -Math.abs(t.price * t.quantity), date: new Date(t.date) });
        } else if (t.type === 'TRANSFER_OUT') {
             cashFlowsForXIRR.push({ amount: Math.abs(t.price * t.quantity), date: new Date(t.date) });
        }
    });
    const currentTotalNetWorth = totalValue + freeCash;
    if (currentTotalNetWorth > 0) {
        cashFlowsForXIRR.push({ amount: currentTotalNetWorth, date: new Date() });
    }
    const mwrr = calculateXIRR(cashFlowsForXIRR);

    const dailyPLPercent = totalCost > 0 ? (dailyPL / totalCost) * 100 : 0;
    const reinvestedProfits = Math.max(0, totalCost - Math.max(0, netPrincipal));
    if (dividendSum !== totalDividends) setTotalDividends(dividendSum);
    if (divTaxSum !== totalDividendTax) setTotalDividendTax(divTaxSum);
    return {
        totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, netRealizedPL,
        totalDividends: dividendSum, totalDividendTax: divTaxSum, dailyPL, dailyPLPercent, totalCommission, totalSalesTax, totalCDC,
        totalOtherFees, totalCGT, freeCash, cashInvestment: totalDeposits - totalWithdrawals,
        netPrincipal, peakNetPrincipal, totalDeposits, reinvestedProfits, dividendReinvested, roi, mwrr, totalNetReturn
    };
  }, [holdings, realizedTrades, portfolioTransactions, ldcpMap]);

  useEffect(() => {
      if (skipPersistRef.current) return;
      if (driveUser || transactions.length > 0) {
          localStorage.setItem('psx_transactions', JSON.stringify(transactions));
          localStorage.setItem('psx_portfolios', JSON.stringify(portfolios));
          localStorage.setItem('psx_current_portfolio_id', currentPortfolioId);
          localStorage.setItem('psx_manual_prices', JSON.stringify(manualPrices));
          localStorage.setItem('psx_ldcp_map', JSON.stringify(ldcpMap));
          localStorage.setItem('psx_listed_in_map', JSON.stringify(listedInMap));
          localStorage.setItem('psx_price_timestamps', JSON.stringify(priceTimestamps));
          localStorage.setItem('psx_brokers', JSON.stringify(brokers));
          localStorage.setItem('psx_sector_overrides', JSON.stringify(sectorOverrides));
          localStorage.setItem('psx_fund_catalog', JSON.stringify(fundCatalog));
          localStorage.setItem('psx_scanner_state', JSON.stringify(scannerState));
          localStorage.setItem('psx_trade_scan_results', JSON.stringify(tradeScanResults));
          localStorage.setItem('psx_performance_history', JSON.stringify(performanceHistory));
          localStorage.setItem('psx_fair_value_cache', JSON.stringify(fairValueCache));
          localStorage.setItem('psx_watchlist', JSON.stringify(watchlist));
      }

      if (driveUser && isReadyToSave.current) {
          setIsCloudSyncing(true);
          const timer = setTimeout(async () => {
              await saveToDrive({
                  transactions,
                  portfolios,
                  currentPortfolioId,
                  manualPrices,
                  ldcpMap,
                  priceTimestamps,
                  brokers,
                  sectorOverrides,
                  scannerState,
                  performanceHistory,
                  fairValueCache,
                  watchlist,
                  dashboardLayout,
                  fundCatalog,
                  geminiApiKey: userApiKey,
                  scrapingApiKey: userScraperKey,
                  webScrapingAIKey: userWebScrapingAIKey
              });
              if (transactions.length > 0) {
                  await syncTransactionsToSheet(transactions, portfolios);
                  if (!googleSheetId) { const id = await getGoogleSheetId(); setGoogleSheetId(id); }
              }
              setIsCloudSyncing(false);
          }, 3000);
          return () => clearTimeout(timer);
      }
  }, [transactions, portfolios, currentPortfolioId, manualPrices, ldcpMap, listedInMap, priceTimestamps, brokers, sectorOverrides, fundCatalog, scannerState, tradeScanResults, performanceHistory, fairValueCache, watchlist, dashboardLayout, driveUser, userApiKey, userScraperKey, userWebScrapingAIKey, googleSheetId]);

  useEffect(() => {
      const tempHoldings: Record<string, Holding> = {};
      const tempRealized: RealizedTrade[] = [];

      const txsByKey: Record<string, Transaction[]> = {};
      portfolioTransactions.forEach(tx => {
          if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE' || tx.type === 'OTHER') return;
          if (tx.type === 'DIVIDEND' || tx.type === 'DIVIDEND_REINVEST' || tx.type === 'TAX') return;
          if (tx.type === 'HISTORY') {
              tempRealized.push({
                  id: tx.id, ticker: 'PREV-PNL', broker: tx.broker || 'Unknown', quantity: 1,
                  buyAvg: 0, sellPrice: 0, date: tx.date, profit: tx.price, fees: 0,
                  commission: 0, tax: tx.tax || 0, cdcCharges: 0, otherFees: 0
              });
              return;
          }
          const brokerKey = (tx.broker || 'Unknown');
          const key = `${tx.ticker}|${brokerKey}`;
          if (!txsByKey[key]) txsByKey[key] = [];
          txsByKey[key].push(tx);
      });
      Object.entries(txsByKey).forEach(([key, txs]) => {
          const [ticker, brokerName] = key.split('|');

          interface Lot {
              quantity: number;
              costPerShare: number;
              date: string;
              commPerShare: number;
              taxPerShare: number;
              cdcPerShare: number;
              otherPerShare: number;
          }
          const lots: Lot[] = [];

          // Group by day so an intraday BUY and SELL square off against each other
          // (a day-trade), then fall back to FIFO across earlier holdings. Dates run
          // oldest-first, and within a day we keep the order the transactions were
          // entered (their position in the list) — the only sequence signal PSX day
          // data gives us. This prevents an intraday sell from eating older lots and
          // avoids phantom/duplicate holdings when a position is squared off same-day.
          const txsByDate: Record<string, Transaction[]> = {};
          txs.forEach(t => {
              if (!txsByDate[t.date]) txsByDate[t.date] = [];
              txsByDate[t.date].push(t);
          });
          const sortedDates = Object.keys(txsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          // Within a day, order by the exact add time (createdAt); legacy rows with
          // no timestamp keep their saved order (stable sort). A SELL squares off
          // only against BUYs entered BEFORE it that day, then falls through to
          // older holdings FIFO (oldest first). This makes same-day results follow
          // the real sequence in which trades were entered.
          const ordVal = (t: Transaction) => (t.createdAt ? Date.parse(t.createdAt) : 0);
          const makeLot = (t: Transaction): Lot => {
              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
              const costPerShare = t.quantity > 0 ? ((t.quantity * t.price) + fees) / t.quantity : 0;
              return {
                  quantity: t.quantity,
                  costPerShare,
                  date: t.date,
                  commPerShare: t.quantity > 0 ? (t.commission || 0) / t.quantity : 0,
                  taxPerShare: t.quantity > 0 ? (t.tax || 0) / t.quantity : 0,
                  cdcPerShare: t.quantity > 0 ? (t.cdcCharges || 0) / t.quantity : 0,
                  otherPerShare: t.quantity > 0 ? (t.otherFees || 0) / t.quantity : 0
              };
          };
          let matchSeq = 0;
          sortedDates.forEach(date => {
              const dayTxs = [...txsByDate[date]].sort((a, b) => ordVal(a) - ordVal(b));
              // Build ALL of the day's buy lots up-front (createdAt order) so a SELL
              // can be covered by ANY same-day BUY regardless of entry order. This
              // prevents phantom "held" shares when a sell was recorded before its
              // covering buy. The lot that stays held still follows createdAt order.
              const dayBuyLots: Lot[] = dayTxs
                  .filter(t => t.type === 'BUY' || t.type === 'TRANSFER_IN')
                  .map(makeLot);
              const daySells = dayTxs.filter(t => t.type === 'SELL' || t.type === 'TRANSFER_OUT');
              daySells.forEach(sellTx => {
                  let qtyToSell = sellTx.quantity;
                  const sellFees = (sellTx.commission || 0) + (sellTx.tax || 0) + (sellTx.cdcCharges || 0) + (sellTx.otherFees || 0);
                  const sellFeePerShare = sellTx.quantity > 0 ? sellFees / sellTx.quantity : 0;
                  const pushRealized = (lotCost: number, matched: number) => {
                      const revenue = matched * sellTx.price;
                      const cost = matched * lotCost;
                      const matchedSellFees = matched * sellFeePerShare;
                      tempRealized.push({
                          id: `${sellTx.id}-m${matchSeq++}`,
                          ticker,
                          broker: brokerName,
                          quantity: matched,
                          buyAvg: lotCost,
                          sellPrice: sellTx.price,
                          date: sellTx.date,
                          profit: revenue - cost - matchedSellFees,
                          fees: matchedSellFees,
                          commission: (sellTx.commission || 0) * (matched / sellTx.quantity),
                          tax: (sellTx.tax || 0) * (matched / sellTx.quantity),
                          cdcCharges: (sellTx.cdcCharges || 0) * (matched / sellTx.quantity),
                          otherFees: (sellTx.otherFees || 0) * (matched / sellTx.quantity)
                      });
                  };
                  // 1) Same-day buys first (all of them, FIFO by createdAt) — squares
                  //    off intraday trades and prevents same-day oversell.
                  for (const bl of dayBuyLots) {
                      if (qtyToSell <= 0.0001) break;
                      if (bl.quantity > 0) {
                          const matched = Math.min(qtyToSell, bl.quantity);
                          pushRealized(bl.costPerShare, matched);
                          bl.quantity -= matched;
                          qtyToSell -= matched;
                      }
                  }
                  // 2) Then older holdings, FIFO oldest-first.
                  while (qtyToSell > 0.0001 && lots.length > 0) {
                      const fifoLot = lots[0];
                      const matched = Math.min(qtyToSell, fifoLot.quantity);
                      pushRealized(fifoLot.costPerShare, matched);
                      fifoLot.quantity -= matched;
                      qtyToSell -= matched;
                      if (fifoLot.quantity < 0.0001) lots.shift();
                  }
              });
              dayBuyLots.forEach(l => { if (l.quantity > 0.0001) lots.push(l); });
          });
          if (lots.length > 0) {
              const totalQty = lots.reduce((acc, l) => acc + l.quantity, 0);
              const totalCost = lots.reduce((acc, l) => acc + (l.quantity * l.costPerShare), 0);

              const totalComm = lots.reduce((acc, l) => acc + (l.quantity * l.commPerShare), 0);
              const totalTax = lots.reduce((acc, l) => acc + (l.quantity * l.taxPerShare), 0);
              const totalCDC = lots.reduce((acc, l) => acc + (l.quantity * l.cdcPerShare), 0);
              const totalOther = lots.reduce((acc, l) => acc + (l.quantity * l.otherPerShare), 0);
              const sector = isFundTicker(ticker)
                  ? (fundCatalog[ticker]?.category || sectorOverrides[ticker] || 'Mutual Fund')
                  : (sectorOverrides[ticker] || getSector(ticker));
              const avgPrice = totalCost / totalQty;
              tempHoldings[key] = {
                  ticker,
                  sector,
                  broker: brokerName,
                  quantity: totalQty,
                  avgPrice,
                  currentPrice: 0,
                  totalCommission: totalComm,
                  totalTax: totalTax,
                  totalCDC: totalCDC,
                  totalOtherFees: totalOther
              };
          }
      });
      const finalHoldings = Object.values(tempHoldings).filter(h => h.quantity > 0.0001).map(h => {
          const current = manualPrices[h.ticker] || h.avgPrice;
          const lastUpdated = priceTimestamps[h.ticker];
          return { ...h, currentPrice: current, lastUpdated };
      });
      setHoldings(finalHoldings);
      setRealizedTrades(tempRealized);
  }, [portfolioTransactions, manualPrices, priceTimestamps, sectorOverrides, fundCatalog]);

  const handleTickerClick = (ticker: string) => {
      if (isFundTicker(ticker)) return;
      localStorage.setItem('psx_analyzer_mode', 'STOCK');
      localStorage.setItem('psx_last_analyzed_ticker', ticker);
      setCurrentView('STOCKS');
  };

  // A stock the user added to the analyzer that they've never traded — make sure we
  // have a live price (and sector/ldcp) so the inline profile shows market info.
  const handleAddStock = useCallback(async (ticker: string) => {
      const t = (ticker || '').trim().toUpperCase();
      if (!t) return;
      if (!(manualPrices[t] > 0)) {
          try {
              const data = await fetchBatchPSXPrices([t]);
              const q = (data as any)[t];
              if (q && q.price > 0) {
                  setManualPrices(prev => ({ ...prev, [t]: q.price }));
                  if (q.ldcp > 0) setLdcpMap(prev => ({ ...prev, [t]: q.ldcp }));
                  if (q.sector && q.sector !== 'Unknown Sector') setSectorOverrides(prev => ({ ...prev, [t]: q.sector }));
                  if (q.listedIn) setListedInMap(prev => ({ ...prev, [t]: q.listedIn }));
                  setPriceTimestamps(prev => ({ ...prev, [t]: new Date().toISOString() }));
              }
          } catch (e) { /* profile still opens with whatever price we have */ }
      }
  }, [manualPrices]);

  // Deep link like /stock/ENGRO on first load → make sure that stock has a price.
  useEffect(() => {
      if (viewTicker) handleAddStock(viewTicker);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fundDisplayNames = useMemo(() => {
      const map: Record<string, string> = {};
      Object.values(fundCatalog).forEach(f => { map[f.id] = f.fundName; });
      return map;
  }, [fundCatalog]);

  const handleSidebarNav = (view: any) => {
      if (view === 'BROKERS') {
          setShowBrokerManager(true);
      } else if (view === 'API_KEYS') {
          setShowApiKeyManager(true);
      } else {
          setCurrentView(view as AppView);
      }
  };

  if (isAuthChecking || sbChecking) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;
  if (showLogin) {
      // Awaiting approval → pending screen. Covers Google users (accessPendingEmail)
      // and email/password users (sbUser not yet approved).
      const pendingEmail = accessPendingEmail || (sbUser && !sbApproved ? sbUser.email : null);
      const blockStatus = accessPendingEmail ? pendingStatus : sbStatus;
      if (pendingEmail && !driveUser && !guestModeRef.current) {
          // Approved once but trial/subscription lapsed → payment screen.
          if (blockStatus?.status === 'expired') {
              return <Paywall email={pendingEmail} onRefresh={refreshPending} onSignOut={handlePendingSignOut} />;
          }
          return <PendingApproval email={pendingEmail} onRefresh={refreshPending} onSignOut={handlePendingSignOut} />;
      }
      return <LoginPage onGuestLogin={handleGuestLogin} onGoogleLogin={handleLogin} onAuthSuccess={refreshAuthStatus} />;
  }

  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);
  const isFundPortfolio = getPortfolioType(currentPortfolio) === 'MUTUAL_FUND';
  const handleSyncMarket = isFundPortfolio ? handleSyncFundNav : handleSyncPrices;
  const perfKey = isCombinedView ? 'combined' : currentPortfolioId;

  // Owner-only admin gate. Matches the signed-in email (Google Drive or Supabase)
  // against the owner address. Configurable via VITE_OWNER_EMAIL.
  const OWNER_EMAIL = ((import.meta as any).env?.VITE_OWNER_EMAIL || 'itruth2011@gmail.com').toLowerCase();
  const isOwner = [driveUser?.email, sbUser?.email]
    .some(e => (e || '').toLowerCase() === OWNER_EMAIL);

  // Render a single dashboard card by id. Used by the customizable DashboardGrid.
  const renderDashCard = (id: string): React.ReactNode => {
      switch (id) {
          case 'stats': {
              const historyData = performanceHistory[perfKey] || [];
              const trendLine = historyData.map((d: any) => {
                  if (typeof d === 'number') return d;
                  return d.totalValue ?? d.netWorth ?? d.value ?? d.y ?? 0;
              }).filter((v: number) => !isNaN(v));
              return (
                  <Dashboard
                      stats={stats}
                      lastUpdated={lastPriceUpdate}
                      userName={driveUser?.name?.split(' ')[0]}
                      onRefresh={handleSyncMarket}
                      onCustomize={() => setCurrentView('DASH_CUSTOMIZE')}
                      trend={trendLine}
                      holdings={holdings}
                  />
              );
          }
          case 'benchmark':
              return <BenchmarkPanel data={performanceHistory[perfKey] || []} portfolioTodayPct={stats.dailyPLPercent} />;
          case 'performance':
              return (
                  <PerformanceChart
                      key={perfKey}
                      transactions={portfolioTransactions}
                      savedData={performanceHistory[perfKey] || []}
                      onSaveData={(data) => setPerformanceHistory(prev => ({ ...prev, [perfKey]: data }))}
                  />
              );
          case 'allocation':
              return <AllocationChart holdings={holdings} />;
          case 'topHoldings':
              return (
                  <TopHoldings
                      holdings={holdings}
                      stats={stats}
                      onTickerClick={handleTickerClick}
                      onViewAll={() => setCurrentView('HOLDINGS')}
                  />
              );
          case 'insights':
              return <PortfolioInsights holdings={holdings} realizedTrades={realizedTrades} stats={stats} />;
          case 'dividends':
              return <UpcomingDividends holdings={holdings} />;
          case 'topMovers':
              return <TopMovers holdings={holdings} onSelectTicker={(t) => setViewTicker(t)} />;
          case 'boardMeetings':
              return <BoardMeetings holdings={holdings} onSelectTicker={(t) => setViewTicker(t)} />;
          case 'summary':
              return <PortfolioSummary holdings={holdings} realizedTrades={realizedTrades} stats={stats} />;
          default:
              return null;
      }
  };

  const trialBanner = (() => {
      const st = sbStatus;
      if (!st) return null;
      if (st.status === 'trial' && st.daysLeft != null) {
          return (
              <div className="shrink-0 text-center text-xs font-bold py-1.5 px-4 bg-amber-500 text-white">
                  Free trial · {st.daysLeft} {st.daysLeft === 1 ? 'day' : 'days'} left. Subscribe to keep access after it ends.
              </div>
          );
      }
      if (st.status === 'paid' && st.daysLeft != null && st.daysLeft <= 7) {
          return (
              <div className="shrink-0 text-center text-xs font-bold py-1.5 px-4 bg-amber-500 text-white">
                  Subscription ends in {st.daysLeft} {st.daysLeft === 1 ? 'day' : 'days'}. Please renew to avoid interruption.
              </div>
          );
      }
      return null;
  })();

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-200 dark:bg-[#0a0a0a] dark:text-slate-100 dark:selection:bg-emerald-900 overflow-hidden">

      {trialBanner}

      <div className="flex flex-1 overflow-hidden relative">

          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[120px]"></div>
              <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-[120px]"></div>
          </div>

          <Sidebar
             currentView={currentView}
             onViewChange={handleSidebarNav}
             isOpen={isMobileSidebarOpen}
             onClose={() => setIsMobileSidebarOpen(false)}
             isSidebarCollapsed={isSidebarCollapsed}
             onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
             driveUser={driveUser}
             authUser={sbUser}
             isOwner={isOwner}
             onLogin={handleLogin}
             onLogout={handleManualLogout}
             isCloudSyncing={isCloudSyncing}
             hasApiKeys={!!userApiKey && !!userScraperKey}
          />

          <div className="flex-1 flex flex-col relative z-10 overflow-y-auto">
              <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-20">

                  <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 animate-in fade-in slide-in-from-top-5 duration-500">

                      <div className="flex items-center gap-3">
                         <button onClick={() => setIsMobileSidebarOpen(true)} className="lg:hidden p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <Menu size={20} />
                         </button>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto bg-white/80 dark:bg-slate-900/80 p-2 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-md">

                          <ThemeToggle />

                          <div className="relative group flex-1 min-w-0">
                              <select
                                  value={currentPortfolioId}
                                  onChange={(e) => setCurrentPortfolioId(e.target.value)}
                                  className="appearance-none bg-transparent border-none text-sm text-slate-700 dark:text-slate-200 font-bold py-1.5 pl-2 pr-6 cursor-pointer focus:ring-0 outline-none w-full dark:bg-transparent truncate"
                              >
                                  {portfolios.map(p => (
                                      <option key={p.id} value={p.id} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                          {p.name}{getPortfolioType(p) === 'MUTUAL_FUND' ? ' · Funds' : ''}
                                      </option>
                                  ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-1 top-2 text-slate-400 pointer-events-none" />
                          </div>

                          <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
                              <button onClick={openEditPortfolioModal} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Edit Portfolio"> <Pencil size={16} /> </button>
                              <button onClick={openCreatePortfolioModal} className="p-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors" title="New Portfolio"> <PlusCircle size={16} /> </button>
                          </div>
                      </div>
                  </header>

                  <main className="animate-in fade-in slide-in-from-bottom-5 duration-700">

                      {/* Connect Google Drive prompt — for signed-in users whose data isn't syncing yet. */}
                      {sbUser && !driveUser && !driveBannerDismissed && (
                          <div className="mb-6 rounded-3xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                      <AlertTriangle size={20} />
                                  </div>
                                  <div className="min-w-0">
                                      <h4 className="font-display font-black text-slate-900 dark:text-white text-sm md:text-base tracking-tight">Connect Google Drive to save your data</h4>
                                      <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
                                          Your portfolio is currently stored only on this device. <span className="font-semibold">It won't be backed up or synced across devices — and could be lost if you clear your browser</span> — until you connect Google Drive.
                                      </p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                  <button
                                      onClick={handleLogin}
                                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 text-slate-800 dark:text-slate-100 font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all hover:-translate-y-0.5 flex items-center gap-2 whitespace-nowrap"
                                  >
                                      <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="Google" /> Connect Google Drive
                                  </button>
                                  <button
                                      onClick={() => setDriveBannerDismissed(true)}
                                      className="p-2 rounded-lg text-amber-600/70 dark:text-amber-400/70 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                                      title="Dismiss for now"
                                  >
                                      <X size={18} />
                                  </button>
                              </div>
                          </div>
                      )}

                      <div className="sticky top-0 z-50 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pt-2 pb-4 mb-6 flex flex-col gap-3 bg-slate-50/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm transition-all">
                          {!isFundPortfolio && <IndexBar />}
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/60 dark:bg-slate-900/60 p-4 rounded-3xl border border-white/60 dark:border-slate-800/60 backdrop-blur-md shadow-card dark:shadow-card-dark">
                          <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                              <div className="flex items-center justify-between min-w-max gap-6">
                                  <div className="flex items-center gap-3">
                                      <button
                                          onClick={() => { setEditingTransaction(null); setShowAddModal(true); }}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 md:px-5 py-3 rounded-xl font-display font-bold shadow-lg shadow-emerald-600/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap text-sm dark:shadow-emerald-900/40"
                                      >
                                          <Plus size={18} /> Add Transaction
                                      </button>
                                      <button
                                          onClick={() => setShowTransferModal(true)}
                                          className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-blue-600 dark:text-blue-400 px-4 md:px-5 py-3 rounded-xl font-display font-bold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                                      >
                                          <ArrowRightLeft size={16} /> Transfer
                                      </button>
                                      {!isFundPortfolio && (
                                      <>
                                      <button
                                          onClick={() => setShowDividendScanner(true)}
                                          className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-indigo-600 dark:text-indigo-400 px-4 md:px-5 py-3 rounded-xl font-display font-bold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                                      >
                                          <Coins size={16} /> Scan Dividends
                                      </button>
                                      <button
                                          onClick={() => setShowUpcomingScanner(true)}
                                          className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-blue-600 dark:text-blue-400 px-4 md:px-5 py-3 rounded-xl font-display font-bold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                                      >
                                          <CalendarClock size={16} /> Future X-Dates
                                      </button>
                                      </>
                                      )}
                                  </div>

                                  <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-2 bg-white dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm shrink-0">
                                          {isCombinedView && (
                                              <Popover.Root>
                                                  <Popover.Trigger asChild>
                                                      <button
                                                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors whitespace-nowrap outline-none"
                                                      >
                                                          <Layers size={14} />
                                                          <span>Portfolios ({combinedPortfolioIds.size})</span>
                                                          <ChevronDown size={14} />
                                                      </button>
                                                  </Popover.Trigger>
                                                  <Popover.Portal>
                                                      <Popover.Content
                                                          className="w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
                                                          sideOffset={5}
                                                          align="end"
                                                      >
                                                          <div className="flex justify-between items-center px-2 py-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                                                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest">Included Portfolios</span>
                                                              <button onClick={handleSelectAllPortfolios} className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline tracking-widest">Select All</button>
                                                          </div>
                                                          <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                                              {portfolios.filter(p => !currentPortfolio || getPortfolioType(p) === getPortfolioType(currentPortfolio)).map(p => {
                                                                  const isSelected = combinedPortfolioIds.has(p.id);
                                                                  return (
                                                                      <div
                                                                          key={p.id}
                                                                          onClick={() => handleTogglePortfolioSelection(p.id)}
                                                                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                                                      >
                                                                          {isSelected ?
                                                                              <CheckSquare size={16} className="text-emerald-600 dark:text-emerald-400" /> :
                                                                              <Square size={16} className="text-slate-300 dark:text-slate-500" />
                                                                          }
                                                                          <span className={`text-sm font-medium ${isSelected ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{p.name}</span>
                                                                      </div>
                                                                  );
                                                              })}
                                                          </div>
                                                          <Popover.Arrow className="fill-white dark:fill-slate-800" />
                                                      </Popover.Content>
                                                  </Popover.Portal>
                                              </Popover.Root>
                                          )}
                                          <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                          <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap">Combined</span>
                                              <button
                                                  onClick={() => {
                                                      const newState = !isCombinedView;
                                                      setIsCombinedView(newState);
                                                      if (newState && currentPortfolio) {
                                                          const t = getPortfolioType(currentPortfolio);
                                                          setCombinedPortfolioIds(new Set(
                                                              portfolios.filter(p => getPortfolioType(p) === t).map(p => p.id)
                                                          ));
                                                      }
                                                  }}
                                                  className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isCombinedView ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                              >
                                                  <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all shadow-sm ${isCombinedView ? 'left-6' : 'left-1'}`}></div>
                                              </button>
                                          </div>
                                      </div>

                                      {/* Manual Prices + Sync PSX — always available, on every view */}
                                      {(
                                          <>
                                              <button
                                                  onClick={() => setShowPriceEditor(true)}
                                                  className="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl font-bold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 whitespace-nowrap shrink-0 text-sm"
                                              >
                                                  <Edit3 size={16} /> <span>Manual Prices</span>
                                              </button>
                                             <div className="flex items-center gap-2 shrink-0">
                                                  <button
                                                      onClick={handleSyncMarket}
                                                      disabled={isSyncing}
                                                      className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl font-bold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                                                  >
                                                      {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} <span>{isFundPortfolio ? 'Sync NAV' : 'Sync PSX'}</span>
                                                  </button>
                                                  {priceError && <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" title="Some prices failed to update. Check list."></div>}
                                              </div>
                                          </>
                                      )}
                                  </div>
                              </div>
                            </div>
                           </div>
                       </div>
                      {currentView === 'DASHBOARD' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <DashboardGrid
                                  layout={isNarrowViewport ? dashboardLayout.mobile : dashboardLayout.web}
                                  device={isNarrowViewport ? 'mobile' : 'web'}
                                  renderCard={renderDashCard}
                              />
                          </div>
                      )}

                      {currentView === 'DASH_CUSTOMIZE' && (
                          <DashboardCustomizer
                              layout={dashboardLayout}
                              renderCard={renderDashCard}
                              onSave={(l) => { setDashboardLayout(l); setCurrentView('DASHBOARD'); }}
                              onCancel={() => setCurrentView('DASHBOARD')}
                          />
                      )}

                      {currentView === 'ADMIN_USERS' && isOwner && <AdminUsers />}

                      {currentView === 'HOLDINGS' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <HoldingsTable
                                  holdings={holdings}
                                  showBroker={true}
                                  failedTickers={failedTickers}
                                  ldcpMap={ldcpMap}
                                  listedInMap={listedInMap}
                                  displayNames={fundDisplayNames}
                                  onTickerClick={handleTickerClick}
                              />
                          </div>
                      )}

                      {currentView === 'STOCKS' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <TickerPerformanceList
                                  transactions={portfolioTransactions}
                                  currentPrices={manualPrices}
                                  sectors={sectorMap}
                                  listedInMap={listedInMap}
                                  onTickerClick={(t) => setViewTicker(t)}
                                  onAddStock={handleAddStock}
                                  onFixSequence={handleFixSequence}
                                  mode="STOCK"
                                  onModeChange={(m) => setCurrentView(m === 'SECTOR' ? 'SECTOR' : 'STOCKS')}
                              />
                          </div>
                      )}
                      {currentView === 'SECTOR' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <TickerPerformanceList
                                  transactions={portfolioTransactions}
                                  currentPrices={manualPrices}
                                  sectors={sectorMap}
                                  listedInMap={listedInMap}
                                  onTickerClick={(t) => setViewTicker(t)}
                                  onAddStock={handleAddStock}
                                  onFixSequence={handleFixSequence}
                                  mode="SECTOR"
                                  onModeChange={(m) => setCurrentView(m === 'SECTOR' ? 'SECTOR' : 'STOCKS')}
                              />
                          </div>
                      )}

                      {currentView === 'SIGNALS' && (
                          <MarketSignalScanner onSymbolClick={(t) => setViewTicker(t)} />
                      )}
                      {currentView === 'REALIZED' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <RealizedTable trades={realizedTrades} showBroker={true} totalCGT={stats.totalCGT} />
                          </div>
                      )}
                      {currentView === 'HISTORY' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <TransactionList
                                  transactions={portfolioTransactions}
                                  onDelete={handleDeleteTransaction}
                                  onDeleteMultiple={handleDeleteTransactions}
                                  onEdit={handleEditClick}
                                  googleSheetId={googleSheetId}
                              />
                          </div>
                      )}
                      {currentView === 'WATCHLIST' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <Watchlist
                                  watchlist={watchlist}
                                  onAdd={handleAddToWatchlist}
                                  onRemove={handleRemoveFromWatchlist}
                                  onSelectTicker={(t) => setViewTicker(t)}
                                  seedPrices={manualPrices}
                                  canSaveAlerts={!!driveUser || !!sbUser}
                              />
                          </div>
                      )}
                      {currentView === 'AI_AGENT' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <AiAgent
                                  holdings={holdings}
                                  stats={stats}
                                  realizedTrades={realizedTrades}
                                  transactions={portfolioTransactions}
                                  apiKey={userApiKey}
                                  onOpenApiKeys={() => setCurrentView('API_KEYS' as AppView)}
                              />
                          </div>
                      )}
                      {currentView === 'CALCULATOR' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <FairValueCalculator
                                  cache={fairValueCache}
                                  onSaveCache={setFairValueCache}
                              />
                          </div>
                      )}
                      {currentView === 'SIMULATOR' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <TradingSimulator
                                  holdings={holdings}
                                  brokers={brokers}
                                  defaultBrokerId={currentPortfolio?.defaultBrokerId || brokers[0]?.id || ''}
                                  transactions={portfolioTransactions}
                              />
                          </div>
                      )}
                      {currentView === 'ALERTS' && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                              <AlertsPage
                                  holdings={holdings}
                                  currentPrices={manualPrices}
                                  canSaveAlerts={!!driveUser || !!sbUser}
                              />
                          </div>
                      )}
                  </main>
              </div>
          </div>
      </div>

      {isPortfolioModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[70] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-display font-black text-slate-900 dark:text-white">
                          {editingPortfolioId ? 'Edit Portfolio' : 'Create Portfolio'}
                      </h3>
                      <button onClick={() => setIsPortfolioModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSavePortfolio}>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Portfolio Name <span className="text-rose-500">*</span></label>
                      <input type="text" autoFocus placeholder="e.g. My Savings" value={portfolioNameInput} onChange={(e) => setPortfolioNameInput(e.target.value)} className="w-full glass-input rounded-xl px-4 py-3.5 text-sm mb-5 transition-all shadow-sm" />

                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Portfolio Type</label>
                      <div className="grid grid-cols-2 gap-2 mb-5">
                          <button
                              type="button"
                              disabled={!!editingPortfolioId}
                              onClick={() => setPortfolioTypeInput('PSX')}
                              className={`py-3 px-3 rounded-xl text-xs font-bold border transition-all ${portfolioTypeInput === 'PSX' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} ${editingPortfolioId ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                              PSX / Stocks
                          </button>
                          <button
                              type="button"
                              disabled={!!editingPortfolioId}
                              onClick={() => setPortfolioTypeInput('MUTUAL_FUND')}
                              className={`py-3 px-3 rounded-xl text-xs font-bold border transition-all ${portfolioTypeInput === 'MUTUAL_FUND' ? 'bg-violet-600 text-white border-violet-600 shadow-md' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} ${editingPortfolioId ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                              Mutual Funds
                          </button>
                      </div>
                      {portfolioTypeInput === 'MUTUAL_FUND' && (
                          <p className="text-[11px] text-violet-600 dark:text-violet-400 mb-4 -mt-2 leading-snug">
                              NAV syncs from our fund API (517+ funds). Updated automatically on weekdays via GitHub Actions.
                          </p>
                      )}

                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                          {portfolioTypeInput === 'MUTUAL_FUND' ? 'Default Bank / Account' : 'Default Broker'} <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative mb-8">
                          <select
                              required
                              value={portfolioBrokerIdInput}
                              onChange={(e) => setPortfolioBrokerIdInput(e.target.value)}
                              className="w-full glass-input rounded-xl px-4 py-3.5 text-sm outline-none appearance-none transition-all shadow-sm"
                          >
                              <option value="">Select a Broker</option>
                              {brokers.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-4 top-[14px] text-slate-400 pointer-events-none" />
                      </div>
                      <div className="flex gap-3">
                          {editingPortfolioId && (
                              <button
                                  type="button"
                                  onClick={handleDeletePortfolio}
                                  className="px-4 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 rounded-xl font-bold transition-all shadow-sm"
                                  title="Delete Portfolio"
                              >
                                  <Trash2 size={20} />
                              </button>
                          )}
                          <button
                              type="submit"
                              disabled={!portfolioNameInput.trim()}
                              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 hover:-translate-y-0.5 active:translate-y-0"
                          >
                              {editingPortfolioId ? 'Save Changes' : 'Create Portfolio'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <TransactionForm
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAddTransaction={handleAddTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          existingTransactions={transactions}
          editingTransaction={editingTransaction}
          brokers={brokers}
          onManageBrokers={() => setShowBrokerManager(true)}
          portfolioDefaultBrokerId={currentPortfolio?.defaultBrokerId}
          portfolioType={getPortfolioType(currentPortfolio)}
          fundCatalog={fundCatalog}
          onRefreshFundCatalog={handleSyncFundNav}
          freeCash={stats.freeCash}
          savedScannedTrades={tradeScanResults}
          onSaveScannedTrades={handleUpdateTradeScanResults}
      />
      <BrokerManager isOpen={showBrokerManager} onClose={() => setShowBrokerManager(false)} brokers={brokers} onAddBroker={handleAddBroker} onUpdateBroker={handleUpdateBroker} onDeleteBroker={handleDeleteBroker} />

      <ApiKeyManager
          isOpen={showApiKeyManager}
          onClose={() => setShowApiKeyManager(false)}
          apiKey={userApiKey}
          scrapingApiKey={userScraperKey}
          webScrapingAIKey={userWebScrapingAIKey}
          onSave={handleSaveApiKey}
          isDriveConnected={!!driveUser}
      />
      <PriceEditor isOpen={showPriceEditor} onClose={() => setShowPriceEditor(false)} holdings={holdings} onUpdatePrices={handleUpdatePrices} />

      <DividendScanner
          key={currentPortfolioId}
          isOpen={showDividendScanner}
          onClose={() => setShowDividendScanner(false)}
          transactions={portfolioTransactions}
          onAddTransaction={handleAddTransaction}
          onOpenSettings={() => setShowApiKeyManager(true)}
          savedResults={scannerState[currentPortfolioId] || []}
          onSaveResults={handleScannerUpdate}
      />
      <UpcomingEventsScanner
          isOpen={showUpcomingScanner}
          onClose={() => setShowUpcomingScanner(false)}
          holdings={holdings}
      />
      <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          currentPortfolioId={currentPortfolioId}
          portfolios={portfolios}
          holdings={holdings}
          brokers={brokers}
          onTransfer={handleTransferStock}
      />
      {viewTicker && (
          <TickerProfile
              ticker={viewTicker}
              currentPrice={manualPrices[viewTicker] || 0}
              sector={sectorOverrides[viewTicker] || getSector(viewTicker)}
              transactions={portfolioTransactions.filter(t => t.ticker === viewTicker)}
              holding={holdings.find(h => h.ticker === viewTicker)}
              realizedTrades={realizedTrades.filter(t => t.ticker === viewTicker)}
              listedInMap={listedInMap}
              onClose={() => setViewTicker(null)}
              canSaveAlerts={!!driveUser || !!sbUser}
          />
      )}
    </div>
  );
};
export default App;