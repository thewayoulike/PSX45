import React, { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { getPasswordAccountBackupStatus } from '../services/auth';
import { Logo } from './ui/Logo';

export function DriveConnectionGate({ email, onConnect, onUseLocal, onSignOut, error, onRetry }: {
  email: string; onConnect: () => void; onUseLocal: () => void; onSignOut: () => void; error?: string | null; onRetry?: () => void;
}) {
  const [status, setStatus] = useState<'checking' | 'saved' | 'unknown' | 'unavailable'>('checking');
  useEffect(() => {
    let active = true;
    setStatus('checking');
    void getPasswordAccountBackupStatus(email).then(result => { if (active) setStatus(result); })
      .catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  }, [email]);
  return <main className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex items-center justify-center p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
      <Logo variant="horizontal" />
      <p className="mt-6 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Signed in as <span className="break-all">{email}</span></p>
      <h1 className="mt-3 text-2xl font-bold">Open your Google Drive portfolio</h1>
      <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        {status === 'checking' ? 'Checking for your saved backup…' : status === 'saved' ? 'We found a saved Drive backup for this account.' : status === 'unavailable' ? 'The backup check is unavailable. Connect Drive to look for your saved portfolio.' : 'If you have a portfolio in Google Drive, connect it to load your saved data.'}
      </p>
      {error && <div className="mt-4 rounded-xl p-3 bg-amber-50 dark:bg-amber-950 text-sm" role="alert"><p>{error}</p>{onRetry && <button type="button" className="underline min-h-[44px] font-semibold" onClick={onRetry}>Retry saved connection</button>}</div>}
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Your password uses the same PSX Tracker account. If Drive was connected before remembered access was enabled, approve Google once to link it. Future password logins can then load your portfolio automatically, including on a new device. Choose <strong className="break-all">{email}</strong> in the Google window.</p>
      <button type="button" onClick={onConnect} className="mt-6 w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-3 flex justify-center items-center gap-2"><Cloud size={20} />Connect Drive & load portfolio</button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Connecting loads your existing backup before cloud saving is enabled. Setting a password does not move or copy your portfolio to another account.</p>
      <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
        <button type="button" onClick={onUseLocal} className="min-h-[44px] underline text-sm">Use this device only</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">This opens local records only. Your Drive portfolio will stay unloaded until you connect.</p>
        <button type="button" onClick={onSignOut} className="mt-2 min-h-[44px] text-sm text-slate-600 dark:text-slate-300 underline">Sign out</button>
      </div>
    </section>
  </main>;
}
