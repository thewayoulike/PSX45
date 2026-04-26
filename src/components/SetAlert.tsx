import React, { useState, useEffect } from 'react';
import { Bell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
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

      const res = await fetch('/api/save-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          ticker,
          targetPrice: Number(target),
          direction
        })
      });

      if (res.ok) {
        setStatus('success');
        setMessage(`Alert set! We'll notify you when it hits Rs. ${target}.`);
        setTarget('');
      } else {
        setStatus('error');
        setMessage('Failed to save alert to database.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'An error occurred.');
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 w-full">
      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
        <Bell size={18} className="text-indigo-500" /> Set Price Alert
      </h4>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rs.</span>
          <input 
            type="number" 
            value={target} 
            onChange={(e) => {
                setTarget(Number(e.target.value));
                if(status !== 'idle') { setStatus('idle'); setMessage(''); }
            }} 
            placeholder={`${currentPrice ? (currentPrice * 1.05).toFixed(2) : '150'}`}
            className="w-full pl-10 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-indigo-500 font-mono font-bold dark:text-slate-200 shadow-sm"
          />
        </div>
        <button 
          onClick={handleSetAlert}
          disabled={status === 'loading' || !target}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : 'Create Alert'}
        </button>
      </div>
      
      {message && (
        <div className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${
          status === 'success' ? 'text-emerald-600' : status === 'error' ? 'text-rose-500' : 'text-indigo-500'
        }`}>
          {status === 'success' && <CheckCircle2 size={14} />}
          {status === 'error' && <AlertCircle size={14} />}
          {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
          {message}
        </div>
      )}
    </div>
  );
};
