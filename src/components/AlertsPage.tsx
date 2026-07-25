import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, Loader2, CheckCircle2, AlertCircle, Target, TrendingUp, Search, Trash2, ArrowUpRight, ArrowDownRight, Plus, X, Pencil } from 'lucide-react';
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
  const [tps, setTps] = useState<string[]>(['']);
  const [sls, setSls] = useState<string[]>([]);
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const uniqueHoldings = Array.from(new Set(holdings.map(h => h.ticker)));
  const currentPrice = currentPrices[ticker] || 0;

  // 1. SAFELY HANDLE iOS SAFARI PERMISSIONS
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      throw new Error("Notifications are not supported on this device. (iOS requires iOS 16.4+ and 'Add to Home Screen')");
    }
    
    let permission = Notification.permission;
    if (permission !== 'granted' && permission !== 'denied') {
      // Safely handle both Promise and Callback versions (Safari quirk)
      permission = await new Promise((resolve) => {
        try {
          const promise = Notification.requestPermission(resolve);
          if (promise && typeof promise.then === 'function') {
            promise.then(resolve).catch(() => resolve('denied'));
          }
        } catch (e) {
          resolve('denied');
        }
      });
    }
    return permission;
  };

  // 2. SAFELY HANDLE iOS SERVICE WORKER
  const getPushSubscription = async () => {
    if (!('serviceWorker' in navigator)) throw new Error("Service Workers are not supported by this browser.");
    if (!('PushManager' in window)) throw new Error("Push API is not supported. Ensure you are on iOS 16.4+ and using the Home Screen app.");

    // Directly register to avoid .ready hanging
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription && VAPID_PUBLIC_KEY) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    return subscription;
  };

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

  const groupedAlerts = useMemo(() => {
    const map: Record<string, { tps: any[], sls: any[] }> = {};
    activeAlerts.forEach(alert => {
        if (!map[alert.ticker]) map[alert.ticker] = { tps: [], sls: [] };
        if (alert.direction === 'ABOVE') map[alert.ticker].tps.push(alert);
        else map[alert.ticker].sls.push(alert);
    });
    return map;
  }, [activeAlerts]);

  const handleTickerChange = (newTicker: string) => {
      setTicker(newTicker.toUpperCase());
      setStatus('idle'); setMessage('');
  };

  const updateArr = (arr: string[], setArr: any, index: number, val: string) => {
      const copy = [...arr];
      copy[index] = val;
      setArr(copy);
      setStatus('idle'); setMessage('');
  };
  const removeArr = (arr: string[], setArr: any, index: number) => {
      setArr(arr.filter((_, i) => i !== index));
  };

  const handleSetAlert = async () => {
    if (!ticker) return;
    
    const validTps = tps.filter(val => val !== '').map(price => ({ price: Number(price), direction: 'ABOVE' }));
    const validSls = sls.filter(val => val !== '').map(price => ({ price: Number(price), direction: 'BELOW' }));
    const allAlerts = [...validTps, ...validSls];

    if (allAlerts.length === 0) {
        setStatus('error'); setMessage('Please enter at least one Target Price or Stop Loss.'); return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setStatus('error'); setMessage('VAPID Public Key missing.'); return;
    }

    setStatus('loading');
    setMessage('Requesting permission & saving...');

    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        setStatus('error'); setMessage('Notification permission denied by user or device.'); return;
      }

      const subscription = await getPushSubscription();
      if (!subscription) throw new Error("Could not create push subscription.");

      const res = await fetch('/api/save-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, ticker, alerts: allAlerts })
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Alerts activated successfully!');
        setTps(['']); 
        setSls([]);
        fetchMyAlerts(); 
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to save alerts.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'An error occurred.');
    }
  };

  const handleDeleteAlert = async (id: string) => {
      try {
          setActiveAlerts(prev => prev.filter(a => a.id !== id));
          const sub = await getPushSubscription();
          await fetch('/api/delete-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, endpoint: sub?.endpoint })
          });
      } catch (e) {
          fetchMyAlerts();
      }
  };

  const handleEditTicker = (editTicker: string, data: any) => {
      setTicker(editTicker);
      setTps(data.tps.length > 0 ? data.tps.map((a: any) => a.targetPrice.toString()) : ['']);
      setSls(data.sls.length > 0 ? data.sls.map((a: any) => a.targetPrice.toString()) : []);
      data.tps.forEach((a: any) => handleDeleteAlert(a.id));
      data.sls.forEach((a: any) => handleDeleteAlert(a.id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTickerGroup = (data: any) => {
      data.tps.forEach((a: any) => handleDeleteAlert(a.id));
      data.sls.forEach((a: any) => handleDeleteAlert(a.id));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 mb-8">
      
      <div className="text-center animate-fade-in-up">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-indigo-100 dark:border-indigo-500/20">
              <Bell size={36} />
          </div>
          <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">Push Notifications</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">Get notified on your phone or desktop when a stock hits your target price.</p>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <Card title="Create Alert Batch (Max 3 TP / 3 SL)" icon={<Target size={18} className="text-indigo-500" />}>
          <div className="mt-5 space-y-7">
            
            {uniqueHoldings.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Quick Select from Portfolio</label>
                <div className="flex flex-wrap gap-2.5">
                  {uniqueHoldings.map(h => (
                    <button key={h} onClick={() => handleTickerChange(h)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${ ticker === h ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600' }`}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="relative bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock Ticker</label>
                    {currentPrice > 0 && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-display font-bold flex items-center gap-1 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-500/20 tabular-nums shadow-sm">
                            <TrendingUp size={14} /> Current: Rs. {currentPrice.toFixed(2)}
                        </span>
                    )}
                </div>
                <div className="relative">
                    <Search size={18} className="absolute left-4 top-3 text-slate-400" />
                    <input type="text" value={ticker} onChange={(e) => handleTickerChange(e.target.value)} placeholder="e.g. OGDC" className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 font-display font-black tracking-wide uppercase shadow-sm" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
                
                {/* TARGET PRICE COLUMN */}
                <div className="bg-emerald-50/30 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100/50 dark:border-emerald-800/30">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                            <ArrowUpRight size={16} /> Target Prices (TP)
                        </label>
                        <span className="text-[10px] font-bold text-emerald-600/50 dark:text-emerald-400/50 bg-emerald-100 dark:bg-emerald-800/50 px-2 py-0.5 rounded-md">{tps.length}/3</span>
                    </div>
                    <div className="space-y-3">
                        {tps.map((val, idx) => (
                            <div key={idx} className="relative flex items-center gap-2">
                                <span className="absolute left-4 text-xs font-bold text-emerald-600/50 dark:text-emerald-400/50">Rs.</span>
                                <input type="number" step="0.01" value={val} onChange={e => updateArr(tps, setTps, idx, e.target.value)} placeholder={currentPrice ? (currentPrice * 1.05).toFixed(2) : "150.00"} className="w-full pl-10 pr-3 py-3 text-sm bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700/50 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold text-emerald-700 dark:text-emerald-300 transition-all shadow-sm" />
                                <button onClick={() => removeArr(tps, setTps, idx)} className="p-2.5 text-slate-400 hover:text-rose-500 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm transition-colors"><X size={16}/></button>
                            </div>
                        ))}
                        {tps.length < 3 && (
                            <button onClick={() => {setTps([...tps, '']); setStatus('idle'); setMessage('');}} className="w-full py-3 border border-dashed border-emerald-300 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                                <Plus size={16}/> Add TP
                            </button>
                        )}
                    </div>
                </div>

                {/* STOP LOSS COLUMN */}
                <div className="bg-rose-50/30 dark:bg-rose-900/10 p-4 rounded-2xl border border-rose-100/50 dark:border-rose-800/30">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                            <ArrowDownRight size={16} /> Stop Losses (SL)
                        </label>
                        <span className="text-[10px] font-bold text-rose-600/50 dark:text-rose-400/50 bg-rose-100 dark:bg-rose-800/50 px-2 py-0.5 rounded-md">{sls.length}/3</span>
                    </div>
                    <div className="space-y-3">
                        {sls.map((val, idx) => (
                            <div key={idx} className="relative flex items-center gap-2">
                                <span className="absolute left-4 text-xs font-bold text-rose-600/50 dark:text-rose-400/50">Rs.</span>
                                <input type="number" step="0.01" value={val} onChange={e => updateArr(sls, setSls, idx, e.target.value)} placeholder={currentPrice ? (currentPrice * 0.95).toFixed(2) : "100.00"} className="w-full pl-10 pr-3 py-3 text-sm bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700/50 rounded-xl outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 font-mono font-bold text-rose-700 dark:text-rose-300 transition-all shadow-sm" />
                                <button onClick={() => removeArr(sls, setSls, idx)} className="p-2.5 text-slate-400 hover:text-rose-500 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm transition-colors"><X size={16}/></button>
                            </div>
                        ))}
                        {sls.length < 3 && (
                            <button onClick={() => {setSls([...sls, '']); setStatus('idle'); setMessage('');}} className="w-full py-3 border border-dashed border-rose-300 dark:border-rose-700/50 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                <Plus size={16}/> Add SL
                            </button>
                        )}
                    </div>
                </div>

            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <button onClick={handleSetAlert} disabled={status === 'loading' || !ticker || (tps.filter(t=>t).length === 0 && sls.filter(s=>s).length === 0)} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 hover:-translate-y-0.5 active:translate-y-0">
                    {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                    {status === 'loading' ? 'Saving Alerts...' : 'Activate Alerts'}
                </button>

                {message && (
                    <div className={`mt-4 flex items-center justify-center gap-2 text-sm font-bold p-4 rounded-xl border shadow-sm ${ status === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' : status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-200 dark:border-rose-500/30' : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30' }`}>
                        {status === 'success' && <CheckCircle2 size={18} className="shrink-0" />}
                        {status === 'error' && <AlertCircle size={18} className="shrink-0" />}
                        {status === 'loading' && <Loader2 size={18} className="animate-spin shrink-0" />}
                        {message}
                    </div>
                )}
            </div>
          </div>
        </Card>
      </div>
      
      <div className="animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        <Card title="My Active Alerts" icon={<Bell size={18} className="text-emerald-500" />}>
          <div className="mt-5">
              {loadingAlerts ? (
                  <div className="flex justify-center py-12 text-slate-400"><Loader2 size={28} className="animate-spin" /></div>
              ) : Object.keys(groupedAlerts).length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm font-medium bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 border-dashed">You have no active alerts.</div>
              ) : (
                  <div className="space-y-4">
                      {Object.entries(groupedAlerts).map(([alertTicker, data]) => (
                          <div key={alertTicker} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm gap-5 transition-all hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:-translate-y-0.5">
                              
                              <div className="flex items-center gap-4 min-w-[140px]">
                                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-black bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                                      {alertTicker.substring(0, 2)}
                                  </div>
                                  <div className="font-display font-black text-slate-900 dark:text-white text-xl tracking-tight">{alertTicker}</div>
                              </div>

                              <div className="flex-1 flex flex-col sm:flex-row gap-5 border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-700/50 pt-4 sm:pt-0 pl-0 sm:pl-5">
                                  <div className="flex-1 bg-emerald-50/30 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100/50 dark:border-emerald-800/30">
                                     <div className="text-[10px] text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                                        <ArrowUpRight size={14} /> Target Prices
                                     </div>
                                     <div className="flex flex-wrap gap-2">
                                         {data.tps.length === 0 && <span className="text-xs text-slate-400 italic font-medium px-1">-</span>}
                                         {data.tps.map(tp => (
                                             <span key={tp.id} className="inline-flex items-center bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 text-sm font-bold font-mono px-2.5 py-1 rounded-lg border border-emerald-200/60 dark:border-emerald-700/50 shadow-sm tabular-nums">
                                                 {tp.targetPrice.toFixed(2)}
                                                 <button onClick={() => handleDeleteAlert(tp.id)} className="ml-2 text-slate-300 hover:text-rose-500 transition-colors"><X size={14}/></button>
                                             </span>
                                         ))}
                                     </div>
                                  </div>

                                  <div className="flex-1 bg-rose-50/30 dark:bg-rose-900/10 p-3 rounded-xl border border-rose-100/50 dark:border-rose-800/30">
                                     <div className="text-[10px] text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                                        <ArrowDownRight size={14} /> Stop Losses
                                     </div>
                                     <div className="flex flex-wrap gap-2">
                                         {data.sls.length === 0 && <span className="text-xs text-slate-400 italic font-medium px-1">-</span>}
                                         {data.sls.map(sl => (
                                             <span key={sl.id} className="inline-flex items-center bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 text-sm font-bold font-mono px-2.5 py-1 rounded-lg border border-rose-200/60 dark:border-rose-700/50 shadow-sm tabular-nums">
                                                 {sl.targetPrice.toFixed(2)}
                                                 <button onClick={() => handleDeleteAlert(sl.id)} className="ml-2 text-slate-300 hover:text-rose-500 transition-colors"><X size={14}/></button>
                                             </span>
                                         ))}
                                     </div>
                                  </div>
                              </div>

                              <div className="flex sm:flex-col items-center justify-end gap-2 border-t sm:border-t-0 border-slate-100 dark:border-slate-700/50 pt-4 sm:pt-0 sm:pl-2">
                                  <button onClick={() => handleEditTicker(alertTicker, data)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500/30 transition-all shadow-sm" title="Edit All">
                                      <Pencil size={16} /> <span className="text-xs font-bold sm:hidden">Edit</span>
                                  </button>
                                  <button onClick={() => handleDeleteTickerGroup(data)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-500/30 transition-all shadow-sm" title="Delete All">
                                      <Trash2 size={16} /> <span className="text-xs font-bold sm:hidden">Delete</span>
                                  </button>
                              </div>

                          </div>
                      ))}
                  </div>
              )}
          </div>
        </Card>
      </div>

    </div>
  );
};
