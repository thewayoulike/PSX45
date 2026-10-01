import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const formatPriceTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Shown after a failed price update, so stale prices are never mistaken for current ones. */
export function PriceStaleNotice({ failed, lastUpdated, isFunds = false }: { failed: boolean; lastUpdated: string | null; isFunds?: boolean }) {
  if (!failed) return null;
  const what = isFunds ? 'NAVs' : 'Prices';
  return <p role="status" className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
    <span>{lastUpdated
      ? <>{what} couldn’t update. Showing {what.toLowerCase()} from <b>{formatPriceTime(lastUpdated)}</b>. Tap Sync to retry.</>
      : <>{what} couldn’t update, and none are saved on this device yet. Tap Sync to retry.</>}</span>
  </p>;
}
