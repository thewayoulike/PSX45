import React, { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { fetchInsiderFilings } from '../services/financials';
import type { InsiderFiling } from '../utils/insiderFilings';
import { panelKeys, readPanel, savePanel } from '../services/panelCache';
import { PanelRefreshNote } from './PanelRefreshNote';

const PAGE = 10;
const DAY = 86_400_000;

/** Share dealings by the company's own people, as filed with PSX. */
export const InsiderTrades: React.FC<{ ticker: string | null }> = ({ ticker }) => {
  const saved = ticker ? readPanel<InsiderFiling[]>(panelKeys.insiders(ticker)) : null;
  const [rows, setRows] = useState<InsiderFiling[]>(() => saved?.data || []);
  const [known, setKnown] = useState(() => saved != null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    if (!ticker) return;
    const cached = readPanel<InsiderFiling[]>(panelKeys.insiders(ticker));
    setRows(cached?.data || []);
    setKnown(cached != null);
    setPage(1);
    setLoading(true);
    setFailed(false);
    const next = await fetchInsiderFilings(ticker);
    if (next) {
      setRows(next);
      setKnown(true);
      savePanel(panelKeys.insiders(ticker), next);
    } else setFailed(true);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const recent = rows.filter((r) => r.ts > 0 && Date.now() - r.ts <= 90 * DAY).length;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-card dark:shadow-card-dark overflow-hidden">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3">
        <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <UserCheck size={18} className="text-indigo-500" /> Insider Trades
        </h3>
        <div className="flex items-center gap-2">
          <PanelRefreshNote updating={loading && known} failed={failed && known && !loading} />
          <button type="button" onClick={load} disabled={loading} title="Refresh"
            className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors disabled:opacity-40">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 bg-indigo-50/50 dark:bg-indigo-500/5 border-b border-slate-100 dark:border-slate-800 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed space-y-1.5">
        <p><span className="font-bold text-slate-800 dark:text-slate-100">What this is:</span> the company's directors, CEO, senior staff, their husbands or wives, and its big shareholders must tell PSX each time they buy or sell this company's shares.</p>
        <p><span className="font-bold text-slate-800 dark:text-slate-100">How to read it:</span> tap <span className="font-semibold">Open</span> to see who traded, buy or sell, how many shares and at what price. Several insiders buying is often read as a good sign; several selling is worth a closer look. It is one clue, not a reason to buy or sell on its own.</p>
      </div>

      {loading && !known ? (
        <div className="flex flex-col items-center justify-center py-14 text-slate-400">
          <Loader2 size={22} className="animate-spin mb-2" />
          <span className="text-xs font-medium">Loading PSX filings for {ticker}…</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
          {failed ? 'Could not reach PSX right now. Try refresh in a moment.' : `No recent insider filings on PSX for ${ticker}.`}
        </p>
      ) : (
        <>
          <div className="px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {recent > 0 ? `${recent} filing${recent === 1 ? '' : 's'} in the last 3 months` : 'No filings in the last 3 months'} · {rows.length} shown on PSX
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {shown.map((r, i) => (
              <div key={`${r.url}-${i}`} className="py-3 px-5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mb-0.5"><CalendarDays size={11} /> {r.date || '—'}</div>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{r.title}</p>
                </div>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                    Open <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 text-xs font-bold text-slate-500">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">Prev</button>
              <span className="tabular-nums">Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">Source: PSX company page (dps.psx.com.pk)</div>
    </div>
  );
};
