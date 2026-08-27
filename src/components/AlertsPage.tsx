import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, Loader2, CheckCircle2, AlertCircle, Search, Trash2, ArrowUpRight, ArrowDownRight, Plus, X, Pencil, Smartphone } from 'lucide-react';
import { Holding } from '../types';
import { Card } from './ui/Card';
import { getAuthHeaders } from '../services/auth';

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
  canSaveAlerts?: boolean;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ holdings, currentPrices, canSaveAlerts = false }) => {
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
    if (!canSaveAlerts) {
      setActiveAlerts([]);
      return;
    }
    try {
      setLoadingAlerts(true);
      const sub = await getPushSubscription();
      if (!sub) return;

      const res = await fetch('/api/get-alerts', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
      const data = await res.json();
      if (data.alerts) setActiveAlerts(data.alerts);
    } catch (e) {
      console.error("Failed to load alerts", e);
    } finally {
      setLoadingAlerts(false);
    }
  }, [canSaveAlerts]);

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
    if (!canSaveAlerts) {
        setStatus('error'); setMessage('Sign in to save alerts. Guest Mode is offline-only.'); return;
    }

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
        headers: await getAuthHeaders(),
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
      if (!canSaveAlerts) return;
      try {
          setActiveAlerts(prev => prev.filter(a => a.id !== id));
          const sub = await getPushSubscription();
          await fetch('/api/delete-alert', {
              method: 'POST',
              headers: await getAuthHeaders(),
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

  // % distance of a target from the current price (null if we don't have a price)
  const distPct = (target: number, cur: number) => (cur > 0 ? ((target - cur) / cur) * 100 : null);
  const fmtSigned = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;

  const canSubmit = !!ticker && (tps.filter(t => t).length > 0 || sls.filter(s => s).length > 0);

  return (
    <div className="w-full min-w-0 space-y-6 mb-10">

      {/* Hero */}
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-indigo-100 dark:border-indigo-500/20">
          <Bell size={30} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">Price Alerts</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium max-w-md mx-auto leading-relaxed">
          Get a push notification the moment a stock hits your price — even when the app is closed.
        </p>
        {!canSaveAlerts && (
          <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-xl px-4 py-2.5 inline-block">
            Sign in with Google or email to save alerts. Guest Mode cannot create them.
          </p>
        )}
      </div>

      {/* CREATE */}
      <div className="animate-fade-in-up" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
        <Card title="New Alert" icon={<Plus size={18} className="text-indigo-500" />}>
          <div className="mt-5 space-y-6">

            {/* Step 1 — pick a stock */}
            <div>
              <div className="flex items-center justify-between mb-2.5 gap-3">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">1 · Which stock?</label>
                {currentPrice > 0 && (
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-500/20 tabular-nums shrink-0">
                    {ticker} · Rs. {currentPrice.toFixed(2)} now
                  </span>
                )}
              </div>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => handleTickerChange(e.target.value)}
                  placeholder="Type a symbol, e.g. OGDC"
                  className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-display font-black tracking-wide uppercase transition-all dark:text-white"
                />
              </div>
              {uniqueHoldings.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Or tap one of your holdings</div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueHoldings.map(h => (
                      <button
                        key={h}
                        onClick={() => handleTickerChange(h)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${ticker === h ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 — set the prices */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-2.5">
                2 · Notify me when the price… <span className="font-medium text-slate-400">(up to 3 each)</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* RISES TO — ABOVE (Target) */}
                <div className="bg-emerald-50/40 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                      <ArrowUpRight size={15} /> Rises to
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700/60 dark:text-emerald-400/60 bg-emerald-100 dark:bg-emerald-800/40 px-2 py-0.5 rounded-md">
                      {tps.filter(t => t !== '').length}/3
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {tps.map((val, idx) => {
                      const d = val !== '' ? distPct(Number(val), currentPrice) : null;
                      const alreadyHit = d != null && d <= 0; // target at/below current -> would fire now
                      return (
                        <div key={idx}>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600/60">Rs.</span>
                              <input
                                type="number" step="0.01" value={val}
                                onChange={e => updateArr(tps, setTps, idx, e.target.value)}
                                placeholder={currentPrice ? (currentPrice * 1.05).toFixed(2) : '150.00'}
                                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700/50 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold text-emerald-700 dark:text-emerald-300 transition-all"
                              />
                            </div>
                            <button onClick={() => removeArr(tps, setTps, idx)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition-colors" title="Remove"><X size={16} /></button>
                          </div>
                          {d != null && (
                            <div className={`text-[10px] font-bold mt-1 ml-1 ${alreadyHit ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {alreadyHit ? `${fmtSigned(d)} — already at/above, will fire now` : `${fmtSigned(d)} above current`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {tps.length < 3 && (
                      <button onClick={() => { setTps([...tps, '']); setStatus('idle'); setMessage(''); }} className="w-full py-2.5 border border-dashed border-emerald-300 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                        <Plus size={15} /> Add target
                      </button>
                    )}
                  </div>
                </div>

                {/* FALLS TO — BELOW (Stop loss) */}
                <div className="bg-rose-50/40 dark:bg-rose-900/10 p-4 rounded-2xl border border-rose-100 dark:border-rose-800/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                      <ArrowDownRight size={15} /> Falls to
                    </span>
                    <span className="text-[10px] font-bold text-rose-700/60 dark:text-rose-400/60 bg-rose-100 dark:bg-rose-800/40 px-2 py-0.5 rounded-md">
                      {sls.filter(s => s !== '').length}/3
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {sls.map((val, idx) => {
                      const d = val !== '' ? distPct(Number(val), currentPrice) : null;
                      const alreadyHit = d != null && d >= 0; // target at/above current -> would fire now
                      return (
                        <div key={idx}>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-600/60">Rs.</span>
                              <input
                                type="number" step="0.01" value={val}
                                onChange={e => updateArr(sls, setSls, idx, e.target.value)}
                                placeholder={currentPrice ? (currentPrice * 0.95).toFixed(2) : '100.00'}
                                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700/50 rounded-xl outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 font-mono font-bold text-rose-700 dark:text-rose-300 transition-all"
                              />
                            </div>
                            <button onClick={() => removeArr(sls, setSls, idx)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition-colors" title="Remove"><X size={16} /></button>
                          </div>
                          {d != null && (
                            <div className={`text-[10px] font-bold mt-1 ml-1 ${alreadyHit ? 'text-amber-500' : 'text-rose-500 dark:text-rose-400'}`}>
                              {alreadyHit ? `${fmtSigned(d)} — already at/below, will fire now` : `${fmtSigned(d)} below current`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {sls.length < 3 && (
                      <button onClick={() => { setSls([...sls, '']); setStatus('idle'); setMessage(''); }} className="w-full py-2.5 border border-dashed border-rose-300 dark:border-rose-700/50 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                        <Plus size={15} /> Add stop-loss
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Activate */}
            <div className="pt-1">
              <button
                onClick={handleSetAlert}
                disabled={status === 'loading' || !canSubmit || !canSaveAlerts}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 enabled:hover:-translate-y-0.5 active:translate-y-0"
              >
                {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                {status === 'loading' ? 'Saving…' : 'Turn on alerts'}
              </button>

              {message && (
                <div className={`mt-4 flex items-center justify-center gap-2 text-sm font-bold p-4 rounded-xl border ${status === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' : status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-200 dark:border-rose-500/30' : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30'}`}>
                  {status === 'success' && <CheckCircle2 size={18} className="shrink-0" />}
                  {status === 'error' && <AlertCircle size={18} className="shrink-0" />}
                  {status === 'loading' && <Loader2 size={18} className="animate-spin shrink-0" />}
                  <span className="text-center leading-snug">{message}</span>
                </div>
              )}

              <p className="text-[10px] text-slate-400 text-center mt-3 flex items-center justify-center gap-1.5 leading-snug">
                <Smartphone size={12} className="shrink-0" /> On iPhone, add the app to your Home Screen first, then allow notifications.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ACTIVE ALERTS */}
      <div className="animate-fade-in-up" style={{ animationDelay: '160ms', animationFillMode: 'both' }}>
        <Card title="Your Active Alerts" icon={<Bell size={18} className="text-emerald-500" />}>
          <div className="mt-5">
            {loadingAlerts ? (
              <div className="flex justify-center py-12 text-slate-400"><Loader2 size={28} className="animate-spin" /></div>
            ) : Object.keys(groupedAlerts).length === 0 ? (
              <div className="text-center py-12 px-6 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 border-dashed">
                <Bell size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No alerts yet.</p>
                <p className="text-xs text-slate-400 mt-1">Set one above and we'll watch the price for you.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedAlerts).map(([alertTicker, data]) => {
                  const cur = currentPrices[alertTicker] || 0;
                  const chip = (a: any, kind: 'tp' | 'sl') => {
                    const d = distPct(a.targetPrice, cur);
                    return (
                      <span
                        key={a.id}
                        className={`inline-flex items-center gap-1.5 text-sm font-bold font-mono px-2.5 py-1 rounded-lg border shadow-sm tabular-nums ${kind === 'tp' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-700/50' : 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-700/50'}`}
                      >
                        {a.targetPrice.toFixed(2)}
                        {d != null && <span className="text-[10px] font-bold text-slate-400">({fmtSigned(d)})</span>}
                        <button onClick={() => handleDeleteAlert(a.id)} className="ml-0.5 text-slate-300 hover:text-rose-500 transition-colors"><X size={14} /></button>
                      </span>
                    );
                  };

                  return (
                    <div key={alertTicker} className="bg-white dark:bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm transition-all hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600/50">
                      {/* Row header: ticker + current price + actions */}
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-display font-black bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shrink-0">
                            {alertTicker.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-display font-black text-slate-900 dark:text-white text-lg tracking-tight truncate">{alertTicker}</div>
                            <div className="text-[11px] text-slate-400 font-semibold tabular-nums">
                              {cur > 0 ? `Now Rs. ${cur.toFixed(2)}` : 'Price unavailable'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleEditTicker(alertTicker, data)} className="p-2.5 rounded-xl text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-slate-200 dark:border-slate-700 transition-all" title="Edit"><Pencil size={16} /></button>
                          <button onClick={() => handleDeleteTickerGroup(data)} className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-slate-700 transition-all" title="Delete all"><Trash2 size={16} /></button>
                        </div>
                      </div>

                      {/* Targets */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-emerald-50/40 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100/60 dark:border-emerald-800/30">
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5"><ArrowUpRight size={13} /> Rises to</div>
                          <div className="flex flex-wrap gap-2">
                            {data.tps.length === 0 ? <span className="text-xs text-slate-400 italic px-1">none</span> : data.tps.map(tp => chip(tp, 'tp'))}
                          </div>
                        </div>
                        <div className="bg-rose-50/40 dark:bg-rose-900/10 p-3 rounded-xl border border-rose-100/60 dark:border-rose-800/30">
                          <div className="text-[10px] text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5"><ArrowDownRight size={13} /> Falls to</div>
                          <div className="flex flex-wrap gap-2">
                            {data.sls.length === 0 ? <span className="text-xs text-slate-400 italic px-1">none</span> : data.sls.map(sl => chip(sl, 'sl'))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

    </div>
  );
};
