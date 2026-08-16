import React, { useEffect, useMemo, useState } from 'react';
import { Holding } from '../types';
import { fetchMarketWideDividends } from '../services/financials';
import { Megaphone, RefreshCw, Loader2, CalendarDays, Star, ExternalLink } from 'lucide-react';

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

interface AnnRow {
  ticker: string;
  ex: Date;
  daysTo: number;
  div: number;       // Rs per share (0 if none)
  bonus: string;     // e.g. "10%" or ""
  right: string;     // e.g. "20%" or ""
  announceDate: string;
}

const SHOW = 60;

const parseEx = (bookClosure: string): Date => {
  const s = String(bookClosure || '').replace('Ex-Date:', '').trim();
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
};

const clean = (v: any): string => {
  const s = String(v ?? '').trim();
  return (!s || s === '-') ? '' : s;
};

export const Announcements: React.FC<Props> = ({ holdings, onSelectTicker }) => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const owned = useMemo(() => new Set(holdings.map(h => h.ticker.toUpperCase())), [holdings]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMarketWideDividends();
      setPayouts(data || []);
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
  }, []);

  const rows = useMemo<AnnRow[]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (payouts || [])
      .map((p: any): AnnRow | null => {
        const ex = parseEx(p.bookClosure);
        if (isNaN(ex.getTime())) return null;
        const daysTo = Math.ceil((ex.getTime() - today.getTime()) / 864e5);
        const m = String(p.details || '').match(/Rs\.?\s*([\d.,]+)/i);
        const div = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
        return {
          ticker: String(p.ticker || '').toUpperCase(),
          ex,
          daysTo,
          div: isNaN(div) ? 0 : div,
          bonus: clean(p.bonus),
          right: clean(p.right),
          announceDate: String(p.announceDate || '').trim(),
        };
      })
      .filter((r): r is AnnRow => r !== null && r.daysTo >= 0)
      .sort((a, b) => a.ex.getTime() - b.ex.getTime())
      .slice(0, SHOW);
  }, [payouts]);

  const ownedCount = useMemo(() => rows.filter(r => owned.has(r.ticker)).length, [rows, owned]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <Megaphone size={16} className="text-rose-500" /> Announcements
          <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· upcoming corporate actions</span>
        </h3>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40" title="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 size={22} className="animate-spin mb-2" />
          <span className="text-xs font-medium">Loading upcoming announcements…</span>
        </div>
      ) : rows.length === 0 && loaded ? (
        <div className="text-center py-10">
          <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming announcements found.</p>
          <p className="text-[11px] text-slate-400 mt-1">Reads your Future X-Dates sheet — sign in to Google if it's blank.</p>
        </div>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto -mx-1 px-1 divide-y divide-slate-50 dark:divide-slate-800/60">
          {rows.map((r, i) => {
            const isOwned = owned.has(r.ticker);
            return (
              <button
                key={`${r.ticker}-${i}`}
                onClick={() => onSelectTicker?.(r.ticker)}
                className={`w-full flex items-center gap-3 py-2.5 px-2 text-left rounded-lg transition-colors ${
                  isOwned
                    ? 'bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100/70 dark:hover:bg-amber-500/20'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center gap-1.5 w-24 shrink-0">
                  <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{r.ticker}</span>
                  {isOwned && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
                </div>

                <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                  {r.div > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">
                      Div Rs {r.div.toFixed(2)}
                    </span>
                  )}
                  {r.bonus && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20">
                      Bonus {r.bonus}
                    </span>
                  )}
                  {r.right && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20">
                      Right {r.right}
                    </span>
                  )}
                  {r.div <= 0 && !r.bonus && !r.right && (
                    <span className="text-[10px] font-semibold text-slate-400">Corporate action</span>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums flex items-center gap-1 justify-end">
                    <CalendarDays size={11} className="text-slate-400" />
                    {r.ex.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums">
                    {r.daysTo === 0 ? 'Ex-date today' : `in ${r.daysTo}d`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <ExternalLink size={9} /> Market-wide upcoming ex-dates
          {ownedCount > 0 && <> · <Star size={9} className="inline text-amber-500 fill-amber-500" /> {ownedCount} you hold</>}
        </span>
        {lastUpdated && <span className="text-[10px] text-slate-400 tabular-nums">Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
};
