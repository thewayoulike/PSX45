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
  
  // Arrays to hold up to 3 TPs and 3 SLs
  const [tps, setTps] = useState<string[]>(['']);
  const [sls, setSls] = useState<string[]>([]);
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const uniqueHoldings = Array.from(new Set(holdings.map(h => h.ticker)));
  const currentPrice = currentPrices[ticker] || 0;

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

  // Group alerts by ticker so they appear on one line
  const groupedAlerts = useMemo(() => {
    const map: Record<string, { tps: any[], sls: any[] }> = {};
    activeAlerts.forEach(alert => {
        if (!map[alert.ticker]) map[alert.ticker] = { tps: [], sls: [] };
        if (alert.direction === 'ABOVE') map[alert.ticker].tps.push(alert);
        else map[alert.ticker].sls.push(alert);
    });
    return map;
  }, [activeAlerts]);

  // Handle changing ticker
  const handleTickerChange = (newTicker: string) => {
      setTicker(newTicker.toUpperCase());
      setStatus('idle');
      setMessage('');
  };

  // Handle Input Changes
  const updateArr = (arr: string[], setArr: any, index: number, val: string) => {
      const copy = [...arr];
      copy[index] = val;
      setArr(copy);
      setStatus('idle');
      setMessage('');
  };
  const removeArr = (arr: string[], setArr: any, index: number) => {
      setArr(arr.filter((_, i) => i !== index));
  };

  const handleSetAlert = async () => {
    if (!ticker) return;
    
    // Gather all valid inputs
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
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error'); setMessage('Notification permission denied.'); return;
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
        setTps(['']); // Reset form
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
          await fetch('/api/delete-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
          });
      } catch (e) {
          fetchMyAlerts();
      }
  };

  const handleEditTicker = (editTicker: string, data: any) => {
      setTicker(editTicker);
      // Load them into the form arrays
      setTps(data.tps.length > 0 ? data.tps.map((a: any) => a.targetPrice.toString()) : ['']);
      setSls(data.sls.length > 0 ? data.sls.map((a: any) => a.targetPrice.toString()) : []);
      
      // Delete the old ones from the DB since we are pulling them into the editor
      data.tps.forEach((a: any) => handleDeleteAlert(a.id));
      data.sls.forEach((a: any) => handleDeleteAlert(a.id));
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTickerGroup = (data: any) => {
      data.tps.forEach((a: any) => handleDeleteAlert(a.id));
      data.sls.forEach((a: any) => handleDeleteAlert(a.id));
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

      <Card title="Create Alert Batch (Max 3 TP / 3 SL)" icon={<Target size={18} className="text-indigo-500" />}>
        <div className="mt-4 space-y-6">
          
          {uniqueHoldings.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Select from Portfolio</label>
              <div className="flex flex-wrap gap-2">
                {uniqueHoldings.map(h => (
                  <button key={h} onClick={() => handleTickerChange(h)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${ ticker === h ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300' }`}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
              <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stock Ticker</label>
                  {currentPrice > 0 && (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800">
                          <TrendingUp size={12} /> Current: Rs. {currentPrice.toFixed(2)}
                      </span>
                  )}
              </div>
              <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input type="text" value={ticker} onChange={(e) => handleTickerChange(e.target.value)} placeholder="e.g. OGDC" className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-bold dark:text-slate-200 uppercase" />
              </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
              
              {/* TARGET PRICE COLUMN */}
              <div>
                  <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                          <ArrowUpRight size={14} /> Target Prices (TP)
                      </label>
                      <span className="text-[10px] font-bold text-slate-400">{tps.length}/3</span>
                  </div>
                  <div className="space-y-2">
                      {tps.map((val, idx) => (
                          <div key={idx} className="relative flex items-center gap-2">
                              <span className="absolute left-3 text-xs font-bold text-slate-400">Rs.</span>
                              <input type="number" step="0.01" value={val} onChange={e => updateArr(tps, setTps, idx, e.target.value)} placeholder={currentPrice ? (currentPrice * 1.05).toFixed(2) : "150"} className="w-full pl-9 pr-3 py-2 text-sm bg-emerald-50/30 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-lg outline-none focus:border-emerald-500 font-mono font-bold dark:text-slate-200" />
                              <button onClick={() => removeArr(tps, setTps, idx)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><X size={16}/></button>
                          </div>
                      ))}
                      {tps.length < 3 && (
                          <button onClick={() => {setTps([...tps, '']); setStatus('idle'); setMessage('');}} className="w-full py-2 border border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                              <Plus size={14}/> Add TP
                          </button>
                      )}
                  </div>
              </div>

              {/* STOP LOSS COLUMN */}
              <div>
                  <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                          <ArrowDownRight size={14} /> Stop Losses (SL)
                      </label>
                      <span className="text-[10px] font-bold text-slate-400">{sls.length}/3</span>
                  </div>
                  <div className="space-y-2">
                      {sls.map((val, idx) => (
                          <div key={idx} className="relative flex items-center gap-2">
                              <span className="absolute left-3 text-xs font-bold text-slate-400">Rs.</span>
                              <input type="number" step="0.01" value={val} onChange={e => updateArr(sls, setSls, idx, e.target.value)} placeholder={currentPrice ? (currentPrice * 0.95).toFixed(2) : "100"} className="w-full pl-9 pr-3 py-2 text-sm bg-rose-50/30 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-lg outline-none focus:border-rose-500 font-mono font-bold dark:text-slate-200" />
                              <button onClick={() => removeArr(sls, setSls, idx)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><X size={16}/></button>
                          </div>
                      ))}
                      {sls.length < 3 && (
                          <button onClick={() => {setSls([...sls, '']); setStatus('idle'); setMessage('');}} className="w-full py-2 border border-dashed border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                              <Plus size={14}/> Add SL
                          </button>
                      )}
                  </div>
              </div>

          </div>

          <div className="pt-2">
              <button onClick={handleSetAlert} disabled={status === 'loading' || !ticker || (tps.filter(t=>t).length === 0 && sls.filter(s=>s).length === 0)} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                  {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                  {status === 'loading' ? 'Saving Alerts...' : 'Activate Alerts'}
              </button>

              {message && (
                  <div className={`mt-4 flex items-center justify-center gap-1.5 text-sm font-bold p-3 rounded-xl border ${ status === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : status === 'error' ? 'bg-rose-50 text-rose-500 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200' }`}>
                      {status === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
                      {status === 'error' && <AlertCircle size={16} className="shrink-0" />}
                      {status === 'loading' && <Loader2 size={16} className="animate-spin shrink-0" />}
                      {message}
                  </div>
              )}
          </div>
        </div>
      </Card>
      
      {/* ACTIVE ALERTS LIST (GROUPED BY TICKER) */}
      <Card title="My Active Alerts" icon={<Bell size={18} className="text-emerald-500" />}>
        <div className="mt-4">
            {loadingAlerts ? (
                <div className="flex justify-center py-8 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
            ) : Object.keys(groupedAlerts).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm font-medium">You have no active alerts.</div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(groupedAlerts).map(([alertTicker, data]) => (
                        <div key={alertTicker} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 gap-4 transition-all hover:border-indigo-300 dark:hover:border-indigo-700">
                            
                            {/* Left Side: Ticker Name */}
                            <div className="flex items-center gap-4 min-w-[120px]">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30">
                                    {alertTicker.substring(0, 2)}
                                </div>
                                <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">{alertTicker}</div>
                            </div>

                            {/* Middle: Badges for TP and SL */}
                            <div className="flex-1 flex flex-col sm:flex-row gap-4 border-l-0 sm:border-l border-slate-200 dark:border-slate-700 pt-3 sm:pt-0 pl-0 sm:pl-4">
                                {/* TPs */}
                                <div className="flex-1">
                                   <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold flex items-center gap-1">
                                      <ArrowUpRight size={12} className="text-emerald-500"/> Target Prices
                                   </div>
                                   <div className="flex flex-wrap gap-2">
                                       {data.tps.length === 0 && <span className="text-xs text-slate-400 italic">-</span>}
                                       {data.tps.map(tp => (
                                           <span key={tp.id} className="inline-flex items-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold font-mono px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                                               {tp.targetPrice.toFixed(2)}
                                               <button onClick={() => handleDeleteAlert(tp.id)} className="ml-1.5 hover:text-rose-500 transition-colors"><X size={14}/></button>
                                           </span>
                                       ))}
                                   </div>
                                </div>

                                {/* SLs */}
                                <div className="flex-1">
                                   <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold flex items-center gap-1">
                                      <ArrowDownRight size={12} className="text-rose-500"/> Stop Losses
                                   </div>
                                   <div className="flex flex-wrap gap-2">
                                       {data.sls.length === 0 && <span className="text-xs text-slate-400 italic">-</span>}
                                       {data.sls.map(sl => (
                                           <span key={sl.id} className="inline-flex items-center bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-bold font-mono px-2 py-1 rounded-md border border-rose-200 dark:border-rose-800">
                                               {sl.targetPrice.toFixed(2)}
                                               <button onClick={() => handleDeleteAlert(sl.id)} className="ml-1.5 hover:text-rose-900 dark:hover:text-rose-200 transition-colors"><X size={14}/></button>
                                           </span>
                                       ))}
                                   </div>
                                </div>
                            </div>

                            {/* Right Side: Edit/Delete All Buttons */}
                            <div className="flex items-center justify-end gap-2 border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-3 sm:pt-0">
                                <button onClick={() => handleEditTicker(alertTicker, data)} className="flex items-center gap-1 text-slate-400 hover:text-blue-500 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Edit All">
                                    <Pencil size={16} /> <span className="text-xs font-bold sm:hidden">Edit</span>
                                </button>
                                <button onClick={() => handleDeleteTickerGroup(data)} className="flex items-center gap-1 text-slate-400 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" title="Delete All">
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
  );
};
