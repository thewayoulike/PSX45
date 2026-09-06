import React, { useMemo, useState, useEffect } from 'react';
import { CompanyPayout, Holding } from '../types';
import { fetchUpcomingXDates } from '../services/financials';
import { normalizeExDateIso } from '../utils/xDateMerge';
import { X, CalendarClock, Loader2, RefreshCw, Layers } from 'lucide-react';

const WINDOW_DAYS = 90;

interface UpcomingEventsScannerProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: Holding[];
  watchlist?: string[];
}

function formatExDateLabel(bookClosure: string): string {
  const iso = normalizeExDateIso(String(bookClosure || '').replace(/^Ex-Date:\s*/i, ''));
  if (!iso) return String(bookClosure || '').replace(/^Ex-Date:\s*/i, '').trim() || '—';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntilEx(bookClosure: string): number | null {
  const iso = normalizeExDateIso(String(bookClosure || '').replace(/^Ex-Date:\s*/i, ''));
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ex = new Date(`${iso}T00:00:00`);
  if (isNaN(ex.getTime())) return null;
  return Math.round((ex.getTime() - today.getTime()) / 864e5);
}

export const UpcomingEventsScanner: React.FC<UpcomingEventsScannerProps> = ({
  isOpen,
  onClose,
  holdings,
  watchlist = [],
}) => {
  const [payouts, setPayouts] = useState<CompanyPayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'MY_HOLDINGS'>('ALL');
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (isOpen && !hasFetched) handleScan();
  }, [isOpen]);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const holdingTickers = holdings.map((h) => h.ticker);
      const data = await fetchUpcomingXDates(holdingTickers, watchlist);
      setPayouts(data);
      setHasFetched(true);
    } catch {
      setError('Failed to fetch data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      const days = daysUntilEx(p.bookClosure);
      if (days == null || days < 0 || days > WINDOW_DAYS) return false;
      if (filterMode === 'MY_HOLDINGS' && !holdings.some((h) => h.ticker === p.ticker)) return false;
      return true;
    });
  }, [payouts, filterMode, holdings]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 pt-12 sm:p-6 sm:pt-16">
      <div className="flex w-full max-w-3xl max-h-[min(85vh,720px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-card-dark animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-700 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <CalendarClock size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-display font-black tracking-tight text-slate-900 dark:text-white">
                Future X-Dates
              </h2>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Next {WINDOW_DAYS} days · holdings & watchlist
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/40 sm:px-5">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              All Market
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('MY_HOLDINGS')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                filterMode === 'MY_HOLDINGS'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Layers size={13} /> My Holdings
            </button>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* List */}
        <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-950/40 sm:p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="mb-3 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-slate-500">Loading X-dates…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-16 text-center text-sm font-medium text-rose-500">{error}</div>
          )}

          {!loading && !error && filteredPayouts.length === 0 && (
            <div className="py-16 text-center text-sm font-medium text-slate-400">
              No upcoming events in the next {WINDOW_DAYS} days.
            </div>
          )}

          {!loading &&
            !error &&
            filteredPayouts.map((item: any, idx) => {
              const isOwned = holdings.some((h) => h.ticker === item.ticker);
              const due = !!item.isDueToday;
              const days = daysUntilEx(item.bookClosure);

              return (
                <div
                  key={`${item.ticker}-${idx}`}
                  className={`mb-2.5 flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center sm:gap-4 ${
                    due
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-600/50 dark:bg-emerald-500/10'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-xs font-display font-black ${
                        due
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : isOwned
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {item.ticker.substring(0, 4)}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <h3 className="font-display text-base font-black tracking-tight text-slate-900 dark:text-white">
                          {item.ticker}
                        </h3>
                        {due && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            Due today
                          </span>
                        )}
                        {isOwned && (
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Owned
                          </span>
                        )}
                        {days != null && !due && (
                          <span className="text-[10px] font-semibold text-slate-400">in {days}d</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.details && item.details !== '-' && (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {item.details}
                          </span>
                        )}
                        {item.bonus && item.bonus !== '-' && item.bonus !== '0' && item.bonus !== '0%' && (
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                            Bonus: {item.bonus.includes('%') ? item.bonus : `${item.bonus}%`}
                          </span>
                        )}
                        {item.right && item.right !== '-' && item.right !== '0' && item.right !== '0%' && (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                            Right: {item.right.includes('%') ? item.right : `${item.right}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Ex-date
                    </div>
                    <div
                      className={`inline-block whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-bold tabular-nums ${
                        due
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/50 dark:bg-blue-950/40 dark:text-blue-300'
                      }`}
                    >
                      {formatExDateLabel(item.bookClosure)}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
