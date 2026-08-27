import React, { useEffect, useMemo, useState } from 'react';
import { ChartCandlestick, Loader2, RefreshCw, Search, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchAllPSXPrices } from '../services/psxData';
import { StockChart } from './StockChart';

const LAST_SYMBOL_KEY = 'psx_charts_symbol';

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
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ChartCandlestick size={22} className="text-emerald-600" />
            Charts
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Browse {rows.length > 0 ? `${rows.length}+` : '500+'} PSX stocks — candles, overlays, momentum &amp; zoom.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh list
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-4 items-start">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[520px] lg:max-h-[calc(100dvh-220px)] lg:sticky lg:top-4">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol or sector…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm font-semibold outline-none focus:border-emerald-500"
              />
            </div>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold outline-none focus:border-emerald-500"
            >
              {sectors.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All sectors' : s}</option>
              ))}
            </select>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
              {filtered.length} stocks
            </p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Loader2 size={20} className="animate-spin mb-2" />
                <span className="text-xs font-medium">Loading PSX listings…</span>
              </div>
            )}
            {!loading && err && (
              <p className="text-xs text-rose-500 px-4 py-8 text-center">{err}</p>
            )}
            {!loading && !err && filtered.map((r) => {
              const activeRow = r.symbol === selected;
              const up = r.changePct >= 0;
              return (
                <button
                  key={r.symbol}
                  type="button"
                  onClick={() => setSelected(r.symbol)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-slate-50 dark:border-slate-800/60 transition-colors ${
                    activeRow
                      ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-l-2 border-l-emerald-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900 dark:text-white">{r.symbol}</span>
                      {up ? (
                        <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                      ) : (
                        <TrendingDown size={12} className="text-rose-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{r.sector}</p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{rs(r.price)}</div>
                    <div className={`text-[10px] font-bold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {up ? '+' : ''}{r.changePct.toFixed(2)}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {active && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{active.symbol}</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {active.sector}
                  {active.listedIn ? ` · ${active.listedIn}` : ''}
                  {' · '}
                  <span className={active.changePct >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                    {active.changePct >= 0 ? '+' : ''}{active.changePct.toFixed(2)}%
                  </span>
                </p>
              </div>
              {onSymbolClick && (
                <button
                  type="button"
                  onClick={() => onSymbolClick(active.symbol)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-emerald-300 transition-colors"
                >
                  <ExternalLink size={13} />
                  Open stock profile
                </button>
              )}
            </div>
          )}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <StockChart symbol={selected} />
          </div>
        </div>
      </div>
    </div>
  );
};
