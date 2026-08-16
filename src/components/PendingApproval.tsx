import React, { useState } from 'react';
import { Clock, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Logo } from './ui/Logo';

interface Props {
  email: string;
  onRefresh: () => Promise<void> | void; // re-check approval
  onSignOut: () => void;
}

export const PendingApproval: React.FC<Props> = ({ email, onRefresh, onSignOut }) => {
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="mb-8 scale-110"><Logo /></div>

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-8">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center mx-auto mb-5">
          <Clock size={30} />
        </div>
        <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight mb-2">Waiting for approval</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-1">
          Thanks for signing up! Your account (<span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>) is pending approval.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-7">
          You'll get an email as soon as it's activated — then just log in again.
        </p>

        <button
          onClick={check}
          disabled={checking}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 mb-3"
        >
          {checking ? <><Loader2 size={18} className="animate-spin" /> Checking…</> : <><RefreshCw size={17} /> I've been approved — check now</>}
        </button>
        <button
          onClick={onSignOut}
          className="w-full text-sm font-bold text-slate-500 hover:text-rose-500 dark:text-slate-400 py-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
};
