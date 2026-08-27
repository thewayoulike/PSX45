import React, { useState } from 'react';
import { DashboardShot, RealizedShot } from './LoginPreviewMocks';
import { ChartShot } from './LoginChartShot';

type PreviewPage = 'dashboard' | 'realized' | 'charts';

const PREVIEW_CAPTIONS: Record<PreviewPage, string> = {
  dashboard: 'Live net worth, today\'s P&L, and vs KSE-100 — the home screen.',
  realized: 'Closed trades, CGT, win rate, and monthly heatmap — so realized performance is never a guess.',
  charts: 'Full-screen PSX charts — candlesticks, moving averages, Bollinger bands, RSI, draw tools, and Fib levels.',
};

export const LoginAppPreview: React.FC = () => {
  const [page, setPage] = useState<PreviewPage>('dashboard');

  return (
    <div className="mt-4">
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
              onClick={() => setPage(id)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                page === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {page === 'dashboard' && <DashboardShot />}
      {page === 'realized' && <RealizedShot />}
      {page === 'charts' && <ChartShot />}

      <p className="text-[11px] text-slate-400 text-center mt-3 font-medium">{PREVIEW_CAPTIONS[page]}</p>
    </div>
  );
};
