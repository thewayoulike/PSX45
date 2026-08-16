import React, { useEffect, useMemo, useState } from 'react';
import { Holding } from '../types';
import { fetchCompanyAnnouncements, CompanyAnnouncement } from '../services/financials';
import { Megaphone, FileText, RefreshCw, Loader2, ExternalLink, CalendarDays } from 'lucide-react';

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

const MAX_TICKERS = 25;   // cap how many holdings we scrape
const CONCURRENCY = 4;    // parallel company-page fetches
const SHOW = 20;          // announcements shown

// Run an async fn over items with limited concurrency.
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const KIND_STYLE: Record<CompanyAnnouncement['kind'], { bg: string; label: string }> = {
  'Board Meeting': { bg: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20', label: 'Board Meeting' },
  'Result':        { bg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20', label: 'Result' },
  'Dividend':      { bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20', label: 'Payout' },
  'Other':         { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Notice' },
};

export const Announcements: React.FC<Props> = ({ holdings, onSelectTicker }) => {
  const [items, setItems] = useState<CompanyAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const tickers = useMemo(
    () => Array.from(new Set(holdings.map(h => h.ticker.toUpperCase()))).slice(0, MAX_TICKERS),
    [holdings]
  );

  const load = async () => {
    if (tickers.length === 0) { setItems([]); setLoaded(true); return; }
    setLoading(true);
    try {
      const results = await mapPool(tickers, CONCURRENCY, (t) => fetchCompanyAnnouncements(t).catch(() => []));
      const merged = results.flat().sort((a, b) => b.ts - a.ts).slice(0, SHOW);
      setItems(merged);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Announcements load failed', e);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <Megaphone size={16} className="text-rose-500" /> Announcements
          <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· your holdings</span>
        </h3>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40" title="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 size={22} className="animate-spin mb-2" />
          <span className="text-xs font-medium">Checking PSX for {tickers.length} holdings…</span>
        </div>
      ) : holdings.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">Add holdings to see their PSX announcements here.</p>
      ) : items.length === 0 && loaded ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">No recent announcements found for your holdings.</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {items.map((a, i) => {
            const s = KIND_STYLE[a.kind];
            return (
              <div key={`${a.pdfUrl}-${i}`} className="py-3 flex items-start gap-3">
                <button
                  onClick={() => onSelectTicker?.(a.ticker)}
                  className="shrink-0 w-14 h-9 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center font-display font-black text-[11px] text-slate-700 dark:text-slate-200 hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors"
                  title={`Open ${a.ticker}`}
                >
                  {a.ticker}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${s.bg}`}>{s.label}</span>
                    <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1"><CalendarDays size={10} /> {a.date || '—'}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">{a.title}</p>
                </div>
                <a
                  href={a.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  title="Open PDF on PSX"
                >
                  <FileText size={16} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[10px] text-slate-400 flex items-center gap-1"><ExternalLink size={9} /> Source: dps.psx.com.pk company pages</span>
        {lastUpdated && <span className="text-[10px] text-slate-400 tabular-nums">Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
};
