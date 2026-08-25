import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBatchPSXPrices } from '../services/psxData';
import { getSector } from '../services/sectors';
import { SetAlert } from './SetAlert';
import {
  Star, Plus, Trash2, Bell, RefreshCw, Loader2, Search, TrendingUp, TrendingDown, X, Eye,
  ChevronDown, ChevronRight, Layers, List
} from 'lucide-react';

interface Quote {
  price: number;
  ldcp: number;
  high: number;
  low: number;
  volume: number;
  sector: string;
}

interface Props {
  watchlist: string[];
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onSelectTicker?: (ticker: string) => void; // open the stock profile
  seedPrices?: Record<string, number>;        // manualPrices, for an instant first paint
  canSaveAlerts?: boolean;
}

const REFRESH_MS = 5 * 60 * 1000; // every 5 minutes while this page is open

const rs = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vol = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

export const Watchlist: React.FC<Props> = ({ watchlist, onAdd, onRemove, onSelectTicker, seedPrices, canSaveAlerts }) => {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [input, setInput] = useState('');
  const [alertFor, setAlertFor] = useState<string | null>(null); // ticker whose alert panel is open
  const [groupBySector, setGroupBySector] = useState<boolean>(() => {
    try { return localStorage.getItem('psx_watch_group') === '1'; } catch { return false; }
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { localStorage.setItem('psx_watch_group', groupBySector ? '1' : '0'); } catch { /* ignore */ }
  }, [groupBySector]);

  const tickers = useMemo(
    () => Array.from(new Set(watchlist.map(t => t.toUpperCase()))),
    [watchlist]
  );

  const refresh = async () => {
    if (tickers.length === 0) { setQuotes({}); return; }
    setLoading(true);
    try {
      const data = await fetchBatchPSXPrices(tickers);
      const next: Record<string, Quote> = {};
      tickers.forEach(t => {
        const d = (data as any)[t];
        if (d && d.price > 0) {
          next[t] = { price: d.price, ldcp: d.ldcp, high: d.high, low: d.low, volume: d.volume, sector: d.sector };
        }
      });
      setQuotes(prev => ({ ...prev, ...next }));
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Watchlist price fetch failed', e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount + whenever the ticker set changes, then every 5 minutes.
  useEffect(() => {
    refresh();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]);

  const handleAdd = () => {
    const t = input.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) { setInput(''); return; }
    onAdd(t);
    setInput('');
  };

  const changePct = (q?: Quote) =>
    q && q.ldcp > 0 ? ((q.price - q.ldcp) / q.ldcp) * 100 : null;

  // Sector for a ticker: prefer the live PSX sector, fall back to the static map.
  const sectorOf = (t: string) => (quotes[t]?.sector || getSector(t) || 'Other');

  const sectorGroups = useMemo(() => {
    const map: Record<string, string[]> = {};
    tickers.forEach(t => { const s = sectorOf(t); (map[s] = map[s] || []).push(t); });
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map(sector => {
        const list = map[sector];
        const changes = list.map(t => changePct(quotes[t])).filter((c): c is number => c != null);
        const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
        return { sector, tickers: list, avg };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, quotes]);

  const toggleSector = (s: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const renderRow = (t: string) => {
    const q = quotes[t];
    const seed = seedPrices?.[t];
    const price = q?.price ?? seed ?? 0;
    const chg = changePct(q);
    const up = (chg ?? 0) >= 0;
    const alertOpen = alertFor === t;

    return (
      <div key={t}>
        <div className="grid grid-cols-[1.3fr_1fr_auto] md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3.5 items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
          {/* Symbol */}
          <button
            onClick={() => onSelectTicker?.(t)}
            className="text-left group flex flex-col min-w-0"
            title="Open stock profile"
          >
            <span className="font-display font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">{t}</span>
            {q?.sector && <span className="text-[10px] text-slate-400 truncate">{q.sector}</span>}
          </button>

          {/* Price */}
          <span className="text-right font-mono font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {price > 0 ? rs(price) : <span className="text-slate-300 dark:text-slate-600">—</span>}
          </span>

          {/* Change */}
          <span className={`text-right font-bold tabular-nums flex items-center justify-end gap-1 ${chg == null ? 'text-slate-300 dark:text-slate-600' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {chg != null && (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
            {chg == null ? '—' : `${up ? '+' : ''}${chg.toFixed(2)}%`}
          </span>

          {/* High / Low / Volume — desktop only */}
          <span className="hidden md:block text-right font-mono text-sm text-slate-500 dark:text-slate-400 tabular-nums">{q?.high ? rs(q.high) : '—'}</span>
          <span className="hidden md:block text-right font-mono text-sm text-slate-500 dark:text-slate-400 tabular-nums">{q?.low ? rs(q.low) : '—'}</span>
          <span className="hidden md:block text-right font-mono text-sm text-slate-500 dark:text-slate-400 tabular-nums">{q?.volume ? vol(q.volume) : '—'}</span>

          {/* Actions */}
          <div className="flex items-center justify-end gap-1">
            {onSelectTicker && (
              <button onClick={() => onSelectTicker(t)} className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="View">
                <Eye size={16} />
              </button>
            )}
            <button
              onClick={() => setAlertFor(alertOpen ? null : t)}
              className={`p-2 rounded-lg transition-colors ${alertOpen ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'}`}
              title="Set price alert"
            >
              <Bell size={16} />
            </button>
            <button
              onClick={() => onRemove(t)}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              title="Remove from watchlist"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Inline alert panel — reuses the exact same server-side alert flow */}
        {alertOpen && (
          <div className="px-5 pb-5 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="relative">
              <button
                onClick={() => setAlertFor(null)}
                className="absolute -top-1 right-1 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Close"
              >
                <X size={16} />
              </button>
              <SetAlert ticker={t} currentPrice={price} canSaveAlerts={canSaveAlerts} />
              <p className="text-[10px] text-slate-400 mt-2 px-1 leading-snug">
                Price alerts run on the server — they'll notify you even when the app is closed or you're logged out.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header + add box */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
              <Star size={20} />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">Watchlist</h2>
              <p className="text-xs text-slate-400 font-medium">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-refresh every 5 min` : 'Live PSX prices'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* List / By-Sector toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                onClick={() => setGroupBySector(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${!groupBySector ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                title="Flat list"
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setGroupBySector(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${groupBySector ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                title="Group by sector"
              >
                <Layers size={13} /> Sectors
              </button>
            </div>
            <button
              onClick={refresh}
              disabled={loading || tickers.length === 0}
              className="p-2.5 rounded-xl text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              title="Refresh now"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Add a symbol, e.g. ENGRO"
              className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 font-bold uppercase tracking-wide dark:text-slate-100 transition-all"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-amber-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 shrink-0"
          >
            <Plus size={18} /> Add
          </button>
        </div>
      </div>

      {/* Empty state */}
      {tickers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-12 text-center">
          <Star size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-display font-black text-slate-800 dark:text-white mb-1">Your watchlist is empty</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add symbols above to track prices before you buy. Your list syncs to your Google Drive.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
          {/* Column header (desktop) */}
          <div className="hidden md:grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800/60 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>Symbol</span><span className="text-right">Price</span><span className="text-right">Change</span>
            <span className="text-right">High</span><span className="text-right">Low</span><span className="text-right">Volume</span>
            <span className="text-right">Actions</span>
          </div>

          {groupBySector ? (
            /* Grouped by sector, each collapsible */
            <div>
              {sectorGroups.map(({ sector, tickers: list, avg }) => {
                const open = !collapsed.has(sector);
                const up = (avg ?? 0) >= 0;
                return (
                  <div key={sector} className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0">
                    <button
                      onClick={() => toggleSector(sector)}
                      className="w-full flex items-center gap-3 px-5 py-3 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      {open ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                      <span className="font-display font-black text-sm text-slate-800 dark:text-slate-100 tracking-tight text-left flex-1 truncate">{sector}</span>
                      {avg != null && (
                        <span className={`text-xs font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                          {up ? '+' : ''}{avg.toFixed(2)}%
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-full px-2 py-0.5 tabular-nums shrink-0">{list.length}</span>
                    </button>
                    {open && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {list.map(renderRow)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat list */
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {tickers.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};