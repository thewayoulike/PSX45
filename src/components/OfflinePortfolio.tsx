import React from 'react';
import type { Transaction } from '../types';
export function OfflinePortfolio() {
  let rows: Transaction[] = [];
  try { const cached = JSON.parse(localStorage.getItem('psx_transactions') || '[]'); if (Array.isArray(cached)) rows = cached.filter(t => t && typeof t === 'object' && typeof t.ticker === 'string' && typeof t.date === 'string' && typeof t.type === 'string' && typeof t.quantity === 'number' && typeof t.price === 'number'); } catch { /* A corrupt cache must not crash recovery. */ }
  return <main className="min-h-screen bg-slate-50 text-slate-900 p-5 dark:bg-slate-950 dark:text-white">
    <h1 className="text-2xl font-bold">Saved portfolio · read only</h1>
    <p className="my-3">These are this device’s saved transactions. Prices and access status cannot be refreshed right now. No changes will be saved or synced.</p>
    <button className="rounded-lg bg-emerald-600 text-white px-4 py-3 mb-5" onClick={() => window.location.reload()}>Reconnect and retry</button>
    {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Date</th><th>Asset</th><th>Type</th><th>Units</th><th>Price / amount</th></tr></thead><tbody>{rows.map((t, i) => <tr key={t.id || i} className="border-b"><td className="py-3 pr-3 whitespace-nowrap">{t.date}</td><td className="pr-3">{t.ticker}</td><td className="pr-3">{t.type}</td><td className="pr-3">{t.quantity}</td><td>{t.price}</td></tr>)}</tbody></table></div> : <p>No saved transactions on this device.</p>}
  </main>;
}
