import React, { useState, useEffect } from 'react';
import { Bell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export const SetAlert = ({ ticker, currentPrice }: { ticker: string, currentPrice: number }) => {
  const [target, setTarget] = useState<number | ''>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  const handleSetAlert = async () => {
    if (!target) return;
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error');
      setMessage('VAPID Public Key is missing in environment variables.');
      return;
    }

    setStatus('loading');
    setMessage('Requesting permission...');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error');
        setMessage('Notification permission denied by browser.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      setMessage('Saving alert...');
      const direction = Number(target) > currentPrice ? 'ABOVE' : 'BELOW';

      // FIX: API expects an `alerts` array of { price, direction }
      const res = await fetch('/api/save-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          ticker,
          alerts: [{ price: Number(target), direction }]
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus('success');
        setMessage(`Alert set! We'll notify you when it hits Rs. ${target}.`);
        setTarget('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to save alert to database.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'An error occurred.');
    }
  };

  return (
    <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 w-full shadow-sm transition-all duration-300">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm shrink-0">
          <Bell size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <h4 className="text-lg font-display font-black text-slate-900 dark:text-white tracking-tight">
          Set Price Alert
        </h4>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-4 top-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rs.</span>
          <input
            type="number"
            step="any"
            value={target}
            onChange={(e) => {
                setTarget(e.target.value === '' ? '' : Number(e.target.value));
                if (status !== 'idle') { setStatus('idle'); setMessage(''); }
            }}
            placeholder={`${currentPrice ? (currentPrice * 1.05).toFixed(2) : '150'}`}
            className="w-full pl-12 pr-4 py-3 text-sm bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold dark:text-slate-100 shadow-sm transition-all tabular-nums"
          />
        </div>
        <button
          onClick={handleSetAlert}
          disabled={status === 'loading' || !target}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        >
          {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : 'Create Alert'}
        </button>
      </div>

      {message && (
        <div className={`mt-4 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-bold border shadow-sm animate-in fade-in zoom-in-95 duration-200 ${
          status === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 
          status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20' : 
          'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-500/20'
        }`}>
          {status === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
          {status === 'error' && <AlertCircle size={16} className="shrink-0" />}
          {status === 'loading' && <Loader2 size={16} className="animate-spin shrink-0" />}
          <span className="leading-snug">{message}</span>
        </div>
      )}
    </div>
  );
};
