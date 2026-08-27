import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { fetchAllPSXPrices } from '../services/psxData';
import { StockChart } from './StockChart';

const LAST_SYMBOL_KEY = 'psx_charts_symbol';
const LIST_OPEN_KEY = 'psx_charts_list_open';

export interface PsxStockRow {
  symbol: string;
  price: number;
  sector: string;
  ldcp: number;
  high: number;
  low: number;
  volume: number;
  listedIn: string;
  changePct: number;
}

interface Props {
  onSymbolClick?: (ticker: string) => void;
}

const rs = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ChartsExplorer: React.FC<Props> = ({ onSymbolClick }) => {
  const [rows, setRows] = useState<PsxStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [listOpen, setListOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LIST_OPEN_KEY) === '1';
  });
  const [selected, setSelected] = useState(() => {
    if (typeof window === 'undefined') return 'OGDC';
    const q = new URLSearchParams(window.location.search).get('symbol');
    if (q) return q.toUpperCase();
    return localStorage.getItem(LAST_SYMBOL_KEY) || 'OGDC';
  });

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await fetchAllPSXPrices();
      const list: PsxStockRow[] = Object.entries(data)
        .map(([symbol, row]) => {
          const ldcp = row.ldcp || row.price;
          const changePct = ldcp > 0 ? ((row.price - ldcp) / ldcp) * 100 : 0;
          return {
            symbol,
            price: row.price,
            sector: row.sector || '—',
            ldcp,
            high: row.high,
            low: row.low,
            volume: row.volume,
            listedIn: row.listedIn || '',
            changePct,
          };
        })
        .filter((r) => r.symbol && r.price > 0)
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      setRows(list);
      if (list.length && !list.some((r) => r.symbol === selected)) {
        setSelected(list[0].symbol);
      }
    } catch {
      setErr('Could not load PSX market watch. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    localStorage.setItem(LAST_SYMBOL_KEY, selected);
    const url = new URL(window.location.href);
    url.searchParams.set('symbol', selected);
    const next = `${url.pathname}?${url.searchParams.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState({}, '', next);
    }
  }, [selected]);

  useEffect(() => {
    localStorage.setItem(LIST_OPEN_KEY, listOpen ? '1' : '0');
  }, [listOpen]);

  const sectors = useMemo(() => {
    const set = new Set(rows.map((r) => r.sector).filter(Boolean));
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (sectorFilter !== 'ALL' && r.sector !== sectorFilter) return false;
      if (!q) return true;
      return r.symbol.includes(q) || r.sector.toUpperCase().includes(q);
    });
  }, [rows, search, sectorFilter]);

  const active = rows.find((r) => r.symbol === selected);

  return (
    <div className="flex flex-col min-h-0 h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-2.5rem)] w-full animate-in fade-in duration-300">
      <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-emerald-300 transition-colors"
          title={listOpen ? 'Hide stock list' : 'Show stock list'}
        >
          {listOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          <span className="hidden sm:inline">{listOpen ? 'Hide list' : 'Stock list'}</span>
        </button>
        {active && (
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="font-black text-slate-900 dark:text-white">{active.symbol}</span>
            <span className="text-[10px] text-slate-400 truncate hidden md:inline">{active.sector}</span>
            <span className={`text-[10px] font-bold tabular-nums ${active.changePct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {active.changePct >= 0 ? '+' : ''}{active.changePct.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onSymbolClick && active && (
            <button
              type="button"
              onClick={() => onSymbolClick(active.symbol)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-300 transition-colors"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Profile</span>
            </button>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-emerald-300 transition-colors disabled:opacity-40"
            title="Refresh stock list"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-2 overflow-hidden">
        {listOpen && (
          <div className="w-[min(100%,280px)] sm:w-[260px] lg:w-[280px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0">
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Symbol or sector…"
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold outline-none focus:border-emerald-500"
              >
                {sectors.map((s) => (
                  <option key={s} value={s}>{s === 'ALL' ? 'All sectors' : s}</option>
                ))}
              </select>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-0.5">{filtered.length} stocks</p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 size={18} className="animate-spin mb-2" />
                  <span className="text-[10px] font-medium">Loading…</span>
                </div>
              )}
              {!loading && err && <p className="text-[10px] text-rose-500 px-3 py-6 text-center">{err}</p>}
              {!loading && !err && filtered.map((r) => {
                const activeRow = r.symbol === selected;
                const up = r.changePct >= 0;
                return (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => setSelected(r.symbol)}
                    className={`w-full flex items-center gap-2 px-2 py-2 text-left border-b border-slate-50 dark:border-slate-800/60 transition-colors ${
                      activeRow
                        ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-l-2 border-l-emerald-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs text-slate-900 dark:text-white">{r.symbol}</span>
                        {up ? <TrendingUp size={11} className="text-emerald-500 shrink-0" /> : <TrendingDown size={11} className="text-rose-500 shrink-0" />}
                      </div>
                      <p className="text-[9px] text-slate-400 truncate">{r.sector}</p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200">{rs(r.price)}</div>
                      <div className={`text-[9px] font-bold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {up ? '+' : ''}{r.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <StockChart symbol={selected} layout="focus" />
        </div>
      </div>
    </div>
  );
};
