import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Loader2, CheckCircle2, AlertCircle, Target, TrendingUp, Search, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Holding } from '../types';
import { Card } from './ui/Card';

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

interface AlertsPageProps {
  holdings: Holding[];
  currentPrices: Record<string, number>;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ holdings, currentPrices }) => {
  const [ticker, setTicker] = useState<string>('');
  const [target, setTarget] = useState<number | ''>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const uniqueHoldings = Array.from(new Set(holdings.map(h => h.ticker)));
  const currentPrice = currentPrices[ticker] || 0;

  // Helper to get Push Subscription
  const getPushSubscription = async () => {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription && VAPID_PUBLIC_KEY) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    return subscription;
  };

  // Fetch active alerts for this user
  const fetchMyAlerts = useCallback(async () => {
    try {
      setLoadingAlerts(true);
      const sub = await getPushSubscription();
      if (!sub) return;

      const res = await fetch('/api/get-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
      const data = await res.json();
      if (data.alerts) setActiveAlerts(data.alerts);
    } catch (e) {
      console.error("Failed to load alerts", e);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => fetchMyAlerts())
        .catch(console.error);
    }
  }, [fetchMyAlerts]);

  const handleSetAlert = async () => {
    if (!target || !ticker) return;
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error'); setMessage('VAPID Public Key missing.'); return;
    }

    setStatus('loading');
    setMessage('Requesting permission...');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error'); setMessage('Notification permission denied.'); return;
      }

      const subscription = await getPushSubscription();
      if (!subscription) throw new Error("Could not create push subscription.");

      setMessage('Saving alert...');
      // Determine if this is a TP (Target Price - ABOVE) or SL (Stop Loss - BELOW)
      const direction = (currentPrice > 0 && Number(target) > currentPrice) ? 'ABOVE' : 'BELOW';

      const res = await fetch('/api/save-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, ticker: ticker.toUpperCase(), targetPrice: Number(target), direction })
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(`Alert set! We'll notify you when ${ticker} hits Rs. ${target}.`);
        setTarget('');
        fetchMyAlerts(); // Refresh the list!
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to save alert.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'An error occurred.');
    }
  };

  const handleDeleteAlert = async (id: string) => {
      try {
          setActiveAlerts(prev => prev.filter(a => a.id !== id)); // Optimistic UI update
          await fetch('/api/delete-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
          });
      } catch (e) {
          fetchMyAlerts(); // Revert if failed
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="mb-6 text-center">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Bell size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Push Notifications</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Get notified on your phone or desktop when a stock hits your target price.</p>
      </div>

      <Card title="Create New Alert" icon={<Target size={18} className="text-indigo-500" />}>
        <div className="mt-4 space-y-6">
          
          {uniqueHoldings.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Select from Portfolio</label>
              <div className="flex flex-wrap gap-2">
                {uniqueHoldings.map(h => (
                  <button key={h} onClick={() => { setTicker(h); setStatus('idle'); setMessage(''); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${ ticker === h ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300' }`}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Stock Ticker</label>
                  <div className="relative">
                      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={ticker} onChange={(e) => { setTicker(e.target.value.toUpperCase()); setStatus('idle'); setMessage(''); }} placeholder="e.g. OGDC" className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-bold dark:text-slate-200 uppercase" />
                  </div>
              </div>

              <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Price</label>
                      {currentPrice > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              <TrendingUp size={10} /> Current: Rs. {currentPrice.toFixed(2)}
                          </span>
                      )}
                  </div>
                  <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rs.</span>
                      <input type="number" value={target} onChange={(e) => { setTarget(Number(e.target.value)); setStatus('idle'); setMessage(''); }} placeholder={currentPrice ? (currentPrice * 1.05).toFixed(2) : "150"} className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-mono font-bold dark:text-slate-200" />
                  </div>
              </div>
          </div>

          <div className="pt-2">
              <button onClick={handleSetAlert} disabled={status === 'loading' || !target || !ticker} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                  {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                  {status === 'loading' ? 'Processing...' : 'Activate Alert'}
              </button>

              {message && (
                  <div className={`mt-4 flex items-center justify-center gap-1.5 text-sm font-bold p-3 rounded-xl border ${ status === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : status === 'error' ? 'bg-rose-50 text-rose-500 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200' }`}>
                      {status === 'success' && <CheckCircle2 size={16} />}
                      {status === 'error' && <AlertCircle size={16} />}
                      {status === 'loading' && <Loader2 size={16} className="animate-spin" />}
                      {message}
                  </div>
              )}
          </div>
        </div>
      </Card>
      
      {/* ACTIVE ALERTS LIST */}
      <Card title="My Active Alerts" icon={<Bell size={18} className="text-emerald-500" />}>
        <div className="mt-4">
            {loadingAlerts ? (
                <div className="flex justify-center py-8 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
            ) : activeAlerts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm font-medium">You have no active alerts.</div>
            ) : (
                <div className="space-y-3">
                    {activeAlerts.map(alert => {
                        const isTP = alert.direction === 'ABOVE';
                        return (
                            <div key={alert.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${isTP ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'}`}>
                                        {isTP ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-100">{alert.ticker}</div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                                            {isTP ? 'Target Price (TP)' : 'Stop Loss (SL)'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Trigger At</div>
                                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200">Rs. {alert.targetPrice.toFixed(2)}</div>
                                    </div>
                                    <button onClick={() => handleDeleteAlert(alert.id)} className="text-slate-400 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" title="Delete Alert">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
      </Card>

      <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
          <strong>How it works:</strong> When the live market price hits your target, your browser will receive a push notification even if this tab is closed. 
      </div>
    </div>
  );
};
