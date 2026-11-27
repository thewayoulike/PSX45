import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Transaction } from '../types';
import { fetchCorporateActions, fetchRenamedTickers } from '../services/pypsxArchive';
import { describeMissingAction, findMissingActions, type MissingAction, type PsxCorporateAction } from '../utils/missingCorporateActions';
import { stockTransactions } from '../utils/stockPerformance';
import { todayPK } from '../utils/dates';

const DISMISSED_KEY = 'psx_corp_dismissed_v1';
const readDismissed = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); }
};
const saveDismissed = (keys: Set<string>) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys].slice(-500))); } catch { /* blocked storage */ }
};
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00+05:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });
const shares = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Checks the exchange's record of bonus shares, splits and rights for every stock
 * in this portfolio, and lists the ones the user hasn't entered. Also spots
 * company codes that have changed (an old code with no price).
 */
export const CorporateActionSuggestions: React.FC<{
  transactions: Transaction[];
  failedTickers: Set<string>;
  onAdd: (action: MissingAction) => void;
  onRename: (oldTicker: string, newTicker: string) => void;
}> = ({ transactions, failedTickers, onAdd, onRename }) => {
  const tickers = useMemo(() => [...new Set(stockTransactions(transactions).map(t => t.ticker.toUpperCase()))].sort(), [transactions]);
  const tickerKey = tickers.join(',');
  const [actions, setActions] = useState<Record<string, PsxCorporateAction[]>>({});
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    if (!tickers.length) return;
    void fetchCorporateActions(tickers).then(result => { if (live) setActions(result); });
    return () => { live = false; };
  }, [tickerKey]);

  const failedKey = [...failedTickers].filter(t => tickers.includes(t.toUpperCase())).sort().join(',');
  useEffect(() => {
    let live = true;
    if (!failedKey) { setRenamed({}); return; }
    void fetchRenamedTickers(failedKey.split(',')).then(result => { if (live) setRenamed(result); });
    return () => { live = false; };
  }, [failedKey]);

  const missing = useMemo(() => findMissingActions(transactions, actions, todayPK(), dismissed), [transactions, actions, dismissed]);
  const renames = Object.entries(renamed).filter(([oldCode]) => !dismissed.has(`rename|${oldCode}`));

  const dismiss = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    saveDismissed(next);
    setDismissed(next);
  };

  if (!missing.length && !renames.length) return null;
  const shown = showAll ? missing : missing.slice(0, 4);

  return (
    <section className="mb-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/5 p-4" aria-label="Suggested corrections">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Check these against your records</h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            The exchange's records show events for stocks you held that aren't in your transactions. Adding them keeps your share count and average cost right.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-emerald-200/60 dark:divide-emerald-500/10">
        {renames.map(([oldCode, newCode]) => (
          <li key={`rename-${oldCode}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
              <b>{oldCode}</b> now trades as <b>{newCode}</b>.
              <span className="block text-xs text-slate-500 dark:text-slate-400">That's why {oldCode} has no price. Renaming updates every transaction for {oldCode}.</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onRename(oldCode, newCode)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Rename to {newCode}</button>
              <button type="button" onClick={() => dismiss(`rename|${oldCode}`)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white/70 dark:hover:bg-slate-800">Ignore</button>
            </div>
          </li>
        ))}
        {shown.map(action => (
          <li key={action.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
              <b>{action.ticker}</b>: {describeMissingAction(action)}, ex-date {longDate(action.exDate)}
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                You held {shares(action.sharesHeld)} shares{action.broker ? ` with ${action.broker}` : ''} the day before.
                {action.kind === 'rights' ? ' Add it only if you paid for the rights shares.' : ''}
                {action.kind === 'split' && !action.splitRatio ? ' Check the ratio on the next screen.' : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onAdd(action)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Add it</button>
              <button type="button" onClick={() => dismiss(action.key)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white/70 dark:hover:bg-slate-800" aria-label={`Not needed: ${action.ticker} ${action.kind}`}>
                <span className="hidden sm:inline">Not needed</span><X size={14} className="sm:hidden" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {missing.length > 4 && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          {showAll ? 'Show fewer' : `Show ${missing.length - 4} more`}
        </button>
      )}
    </section>
  );
};
