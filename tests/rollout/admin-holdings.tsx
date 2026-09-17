// Local preview only: isolated memory storage, synthetic users and no live API requests.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminUsers } from '../../src/components/AdminUsers';
import { HoldingsTable } from '../../src/components/HoldingsTable';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { computeAccess } from '../../lib/access.js';
import '../../src/index.css';

const memory = new Map([['psx_admin_secret', 'synthetic-preview-only']]);
Object.defineProperty(window, 'localStorage', { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
} });
const users = [
  { name: 'Free Member', approved: true, approved_at: '2020-01-01' },
  { name: 'Trial Member', approved: true, approved_at: new Date().toISOString() },
  { name: 'Paid Member', approved: true, access_until: '2099-01-01' },
  { name: 'Lifetime Member', approved: true, lifetime: true },
  { name: 'Pending Member', approved: false },
].map((row, index) => ({ ...row, email: `member${index}@example.invalid`, access: computeAccess(row) }));
users.push({ name: 'Unrecognized Plan', email: 'unknown@example.invalid', access: { status: 'future-plan' } } as any);
window.fetch = async (input, init) => {
  if (String(input) === '/api/admin-users' && (!init?.method || init.method === 'GET')) {
    return new Response(JSON.stringify({ users }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('Live requests and account changes are disabled in this preview.');
};
const holding = { ticker: 'OGDC', sector: 'Oil and Gas Exploration', broker: 'Demo broker', quantity: 10000, avgPrice: 183.257, currentPrice: 200.5, totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0 };
function Fixture() {
  const [view, setView] = useState('Admin');
  const [dark, setDark] = useState(false);
  const fund = view === 'Funds';
  return <div className={dark ? 'dark' : ''}><main className="min-h-screen bg-slate-100 dark:bg-slate-950 p-3 text-slate-900 dark:text-white">
    <nav className="flex flex-wrap gap-3 mb-4">{['Admin', 'Stocks', 'Funds'].map(name => <button className="p-2 border rounded" key={name} onClick={() => setView(name)}>{name}</button>)}<button className="p-2 border rounded" onClick={() => setDark(!dark)}>Toggle theme</button></nav>
    <ErrorBoundary>{view === 'Admin' ? <AdminUsers /> : <HoldingsTable holdings={[fund ? { ...holding, ticker: 'MF:demo-income-fund', sector: 'Income', quantity: 12345.6789, avgPrice: 108.123456, currentPrice: 112.4567 } : holding]} portfolioType={fund ? 'MUTUAL_FUND' : 'PSX'} showBroker={!fund} ldcpMap={{ OGDC: 199, 'MF:demo-income-fund': 112 }} />}</ErrorBoundary>
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
