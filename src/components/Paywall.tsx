import React, { useState } from 'react';
import { Lock, RefreshCw, LogOut, Loader2, Copy, Check, Mail, CreditCard } from 'lucide-react';
import { Logo } from './ui/Logo';

interface Props {
  email: string;
  onRefresh: () => Promise<void> | void; // re-check access after paying
  onSignOut: () => void;
}

// Who receives the payment screenshot.
const PAY_EMAIL = ((import.meta as any).env?.VITE_OWNER_EMAIL || 'itruth2011@gmail.com');

// Per-month pricing (cheaper the longer you commit). Edit here if prices change.
const PLANS: { label: string; perMonth: string; total: string; best?: boolean }[] = [
  { label: '1 Month', perMonth: 'Rs. 750', total: 'Rs. 750' },
  { label: '3 Months', perMonth: 'Rs. 650', total: 'Rs. 1,950' },
  { label: '6 Months', perMonth: 'Rs. 550', total: 'Rs. 3,300' },
  { label: '1 Year', perMonth: 'Rs. 500', total: 'Rs. 6,000', best: true },
];

const ACCOUNTS: { bank: string; iban: string }[] = [
  { bank: 'Naya Pay', iban: 'PK96NAYA1234503367580244' },
  { bank: 'Meezan Bank', iban: 'PK80MEZN0011670110653033' },
];
const ACCOUNT_TITLE = 'Muhammad Aftab Jamil';

export const Paywall: React.FC<Props> = ({ email, onRefresh, onSignOut }) => {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-6 font-sans">
      <div className="mb-6 scale-110"><Logo /></div>

      <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-7">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 border border-rose-100 dark:border-rose-500/20 flex items-center justify-center mx-auto mb-5">
          <Lock size={28} />
        </div>
        <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight text-center mb-1">Your trial has ended</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed text-center mb-6">
          To keep using PSX Tracker, please subscribe. Pay via bank transfer and send the receipt — your access is restored as soon as it's confirmed.
        </p>

        {/* Plans — per month, cheaper the longer you commit */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {PLANS.map(p => (
            <div key={p.label} className={`relative rounded-2xl border p-3 text-center ${p.best ? 'border-emerald-400 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
              {p.best && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-widest bg-emerald-600 text-white px-2 py-0.5 rounded-full">Best value</span>}
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{p.label}</div>
              <div className="text-base font-display font-black text-slate-900 dark:text-white mt-1">{p.perMonth}<span className="text-[10px] font-bold text-slate-400">/mo</span></div>
              <div className="text-[10px] text-slate-400">{p.total} total</div>
            </div>
          ))}
        </div>

        {/* Accounts */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 text-sm font-bold"><CreditCard size={15} /> Pay to</div>
          {ACCOUNTS.map(a => (
            <div key={a.iban} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{a.bank}</div>
                <div className="font-mono text-sm text-slate-800 dark:text-slate-100 truncate">{a.iban}</div>
              </div>
              <button onClick={() => copy(a.iban)} className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-white dark:hover:bg-slate-900 transition-colors" title="Copy IBAN">
                {copied === a.iban ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
          ))}
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            Account title: <span className="font-semibold text-slate-700 dark:text-slate-300">{ACCOUNT_TITLE}</span>
          </div>
        </div>

        {/* Send receipt */}
        <div className="flex items-center gap-2 mt-4 rounded-2xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 p-3">
          <Mail size={16} className="text-brand-500 shrink-0" />
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Send the transaction screenshot to{' '}
            <a href={`mailto:${PAY_EMAIL}?subject=PSX%20Tracker%20payment%20-%20${encodeURIComponent(email)}`} className="font-bold text-brand-600 dark:text-brand-400 underline">{PAY_EMAIL}</a>
            <span className="text-slate-400"> from </span>
            <span className="font-semibold">{email}</span>.
          </div>
        </div>

        <button
          onClick={check}
          disabled={checking}
          className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
        >
          {checking ? <><Loader2 size={18} className="animate-spin" /> Checking…</> : <><RefreshCw size={17} /> I've paid — check access</>}
        </button>
        <button
          onClick={onSignOut}
          className="w-full text-sm font-bold text-slate-500 hover:text-rose-500 dark:text-slate-400 py-2.5 mt-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
};
