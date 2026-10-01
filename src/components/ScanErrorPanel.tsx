import React from 'react';
import { AlertTriangle, RefreshCcw, Search } from 'lucide-react';
import { SCAN_ENGINE_UNAVAILABLE } from '../services/scanEngine';

export function ScanErrorPanel({ message, emailText, onRetry, onChangeSource }: {
  message: string; emailText: boolean; onRetry: () => void; onChangeSource: () => void;
}) {
  const unavailable = message === SCAN_ENGINE_UNAVAILABLE;
  const noResults = message.includes('No trades found');
  return <div role="alert" className={`w-full border-2 border-dashed rounded-3xl flex flex-col items-center p-6 ${noResults ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-500/10' : 'border-rose-200 bg-rose-50/50 dark:bg-rose-500/10'}`}>
    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${noResults ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-500'}`}>{noResults ? <Search size={32} /> : <AlertTriangle size={32} />}</div>
    <h3 className="text-lg font-display font-black mb-2 text-slate-900 dark:text-white">{unavailable ? 'AI Scan unavailable' : noResults ? 'No Results Found' : 'Scan Failed'}</h3>
    <p className="text-sm text-center leading-relaxed text-slate-600 dark:text-slate-300 mb-5 break-words max-w-full">{message}</p>
    <button type="button" onClick={unavailable ? onRetry : onChangeSource} className="px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2"><RefreshCcw size={16} />{unavailable ? 'Retry AI Scan' : emailText ? 'Edit Email Text' : 'Try Different File'}</button>
  </div>;
}
