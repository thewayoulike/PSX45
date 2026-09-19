import React, { useEffect } from 'react';
import { markStartup } from '../utils/performance';
import type { Transaction } from '../types';
export function OfflinePortfolio({ refreshing = false, error }: { refreshing?: boolean; error?: string | null }) {
  useEffect(() => { if (refreshing) markStartup('cached_portfolio'); }, [refreshing]);
  let rows: Transaction[] = [];
  try { const cached = JSON.parse(localStorage.getItem('psx_transactions') || '[]'); if (Array.isArray(cached)) rows = cached.filter(t => t && typeof t === 'object' && typeof t.ticker === 'string' && typeof t.date === 'string' && typeof t.type === 'string' && typeof t.quantity === 'number' && typeof t.price === 'number'); } catch { /* A corrupt cache must not crash recovery. */ }
  return <main className="min-h-screen bg-slate-50 text-slate-900 p-5 dark:bg-slate-950 dark:text-white">
    <h1 className="text-2xl font-bold">Saved portfolio · read only</h1>
    <p className="my-3">{refreshing ? "Refreshing from Drive. These saved transactions are available to read while the latest backup opens." : <>These are this device’s saved transactions. Prices and access status cannot be refreshed right now. No changes will be saved or synced.</>}</p>
    {error && <p role="alert" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{error}</p>}
    {!refreshing && <button className="rounded-lg bg-emerald-600 text-white px-4 py-3 mb-5" onClick={() => window.location.reload()}>Reconnect and retry</button>}
    {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Date</th><th>Asset</th><th>Type</th><th>Units</th><th>Price / amount</th></tr></thead><tbody>{rows.map((t, i) => <tr key={t.id || i} className="border-b"><td className="py-3 pr-3 whitespace-nowrap">{t.date}</td><td className="pr-3">{t.ticker}</td><td className="pr-3">{t.type}</td><td className="pr-3">{t.quantity}</td><td>{t.price}</td></tr>)}</tbody></table></div> : <p>No saved transactions on this device.</p>}
  </main>;
}
