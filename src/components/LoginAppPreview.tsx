import React, { lazy, Suspense, useState } from 'react';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { DashboardShot, RealizedShot } from './LoginPreviewMocks';
import { ChartShot } from './LoginChartShot';

type PreviewPage = 'dashboard' | 'realized' | 'charts';
const LoginMobileDashboard = lazy(() => import('./LoginMobileDashboard'));

const PREVIEW_CAPTIONS: Record<PreviewPage, string> = {
  dashboard: 'Live net worth, today\'s P&L, and vs KSE-100 — the home screen.',
  realized: 'Closed trades, CGT, win rate, and monthly heatmap — so realized performance is never a guess.',
  charts: 'Full-screen PSX charts — candlesticks, moving averages, Bollinger bands, RSI, draw tools, and Fib levels.',
};

export const LoginAppPreview: React.FC = () => {
  const [page, setPage] = useState<PreviewPage>('dashboard');
  const mobile = useMobileLayout();

  return (
    <div className="login-app-preview mt-4">
      <div className="flex justify-center mb-3">
        <div className="inline-flex flex-wrap justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1 shadow-sm gap-0.5">
          {([
            ['dashboard', 'Dashboard'],
            ['realized', 'Realized P&L'],
            ['charts', 'PSX Charts'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={page === id}
              onClick={() => setPage(id)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                page === id ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {page === 'dashboard' && (mobile
        ? <Suspense fallback={<p role="status">Loading dashboard preview…</p>}><LoginMobileDashboard /></Suspense>
        : <DashboardShot />)}
      {page === 'realized' && <RealizedShot />}
      {page === 'charts' && <ChartShot />}

      <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center mt-3 font-medium">{mobile && page === 'dashboard' ? 'A sample of every dashboard section, from portfolio returns to holdings and market updates.' : PREVIEW_CAPTIONS[page]} {page !== 'dashboard' || !mobile ? 'Illustrative sample data.' : ''}</p>
    </div>
  );
};
