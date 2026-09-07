import React, { useState } from 'react';
import { Lock, RefreshCw, Loader2, Copy, Check, Mail, CreditCard, X } from 'lucide-react';

interface Props {
  email: string;
  onRefresh?: () => Promise<void> | void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

const PAY_EMAIL = ((import.meta as any).env?.VITE_OWNER_EMAIL || 'itruth2011@gmail.com');

const PLANS: { label: string; perMonth: string; total: string; best?: boolean }[] = [
  { label: '1 Month', perMonth: 'Rs. 500', total: 'Rs. 500' },
  { label: '3 Months', perMonth: 'Rs. 400', total: 'Rs. 1,200' },
  { label: '1 Year', perMonth: 'Rs. 350', total: 'Rs. 4,200', best: true },
];

const ACCOUNTS: { bank: string; iban: string }[] = [
  { bank: 'Naya Pay', iban: 'PK96NAYA1234503367580244' },
  { bank: 'Jazz Cash', iban: '03367580244' },
  { bank: 'Bank Transfer (Meezan)', iban: 'PK80MEZN0011670110653033' },
];
const ACCOUNT_TITLE = 'Muhammad Aftab Jamil';

/** Soft upgrade sheet — Free users stay in the app; this is not a hard lockout. */
export const UpgradeModal: React.FC<Props> = ({
  email,
  onRefresh,
  onClose,
  title = 'Upgrade to Paid',
  subtitle = 'Unlock unlimited tickers, full history, and higher tool limits. Pay via bank transfer and send the receipt — access is restored as soon as it’s confirmed.',
}) => {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const check = async () => {
    if (!onRefresh) return;
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xl p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Lock size={24} />
        </div>
        <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight text-center mb-1">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed text-center mb-5">{subtitle}</p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {PLANS.map((p) => (
            <div key={p.label} className={`relative rounded-2xl border p-3 text-center ${p.best ? 'border-emerald-400 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
              {p.best && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-widest bg-emerald-600 text-white px-2 py-0.5 rounded-full">Best value</span>}
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{p.label}</div>
              <div className="text-base font-display font-black text-slate-900 dark:text-white mt-1">{p.perMonth}<span className="text-[10px] font-bold text-slate-400">/mo</span></div>
              <div className="text-[10px] text-slate-400">{p.total} total</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 text-sm font-bold"><CreditCard size={15} /> Pay to</div>
          {ACCOUNTS.map((a) => (
            <div key={a.iban} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{a.bank}</div>
                <div className="font-mono text-sm text-slate-800 dark:text-slate-100 truncate">{a.iban}</div>
              </div>
              <button type="button" onClick={() => copy(a.iban)} className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-900 transition-colors" title="Copy">
                {copied === a.iban ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
          ))}
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            Account title: <span className="font-semibold text-slate-700 dark:text-slate-300">{ACCOUNT_TITLE}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3">
          <Mail size={16} className="text-emerald-600 shrink-0" />
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Send the transaction screenshot to{' '}
            <a href={`mailto:${PAY_EMAIL}?subject=PSX%20Tracker%20payment%20-%20${encodeURIComponent(email)}`} className="font-bold text-emerald-700 dark:text-emerald-400 underline">{PAY_EMAIL}</a>
            <span className="text-slate-400"> from </span>
            <span className="font-semibold">{email}</span>.
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
          >
            {checking ? <><Loader2 size={18} className="animate-spin" /> Checking…</> : <><RefreshCw size={17} /> I&apos;ve paid — check access</>}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full text-sm font-bold text-slate-500 dark:text-slate-400 py-2.5 mt-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Continue on Free
        </button>
      </div>
    </div>
  );
};
