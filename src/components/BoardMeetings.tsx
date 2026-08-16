import React, { useEffect, useMemo, useState } from 'react';
import { Holding } from '../types';
import { fetchBoardMeetings, BoardMeeting } from '../services/financials';
import { CalendarClock, RefreshCw, Loader2, Star, MapPin, Clock, ExternalLink } from 'lucide-react';

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

const SHOW = 80;

export const BoardMeetings: React.FC<Props> = ({ holdings, onSelectTicker }) => {
  const [items, setItems] = useState<BoardMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const owned = useMemo(() => new Set(holdings.map(h => h.ticker.toUpperCase())), [holdings]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchBoardMeetings();
      setItems(data.slice(0, SHOW));
      setLastUpdated(new Date());
    } catch (e) {
      console.error('BoardMeetings load failed', e);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownedCount = useMemo(() => items.filter(m => owned.has(m.ticker)).length, [items, owned]);

  const dayLabel = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d}d`);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <CalendarClock size={16} className="text-rose-500" /> Board Meetings
          <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· upcoming, market-wide</span>
        </h3>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40" title="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 size={22} className="animate-spin mb-2" />
          <span className="text-xs font-medium">Loading upcoming board meetings…</span>
        </div>
      ) : items.length === 0 && loaded ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">No upcoming board meetings found.</p>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto -mx-1 px-1 divide-y divide-slate-50 dark:divide-slate-800/60">
          {items.map((m, i) => {
            const isOwned = owned.has(m.ticker);
            return (
              <button
                key={`${m.ticker}-${i}`}
                onClick={() => onSelectTicker?.(m.ticker)}
                className={`w-full flex items-center gap-3 py-2.5 px-2 text-left rounded-lg transition-colors ${
                  isOwned
                    ? 'bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100/70 dark:hover:bg-amber-500/20'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{m.ticker}</span>
                    {isOwned && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{m.name || m.sector}</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    {m.time && <span className="inline-flex items-center gap-0.5"><Clock size={9} /> {m.time}</span>}
                    {m.place && <span className="inline-flex items-center gap-0.5"><MapPin size={9} /> {m.place}</span>}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    {m.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </div>
                  <div className={`text-[10px] font-semibold tabular-nums ${m.daysTo <= 3 ? 'text-rose-500' : 'text-slate-400'}`}>
                    {dayLabel(m.daysTo)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <ExternalLink size={9} /> Upcoming board meetings
          {ownedCount > 0 && <> · <Star size={9} className="inline text-amber-500 fill-amber-500" /> {ownedCount} you hold</>}
        </span>
        {lastUpdated && <span className="text-[10px] text-slate-400 tabular-nums">Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
};
