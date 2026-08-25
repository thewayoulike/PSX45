import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIndexQuote } from '../services/psxData';
import { isPsxMarketHours } from '../utils/dates';

interface Idx { label: string; value: number; changePct: number | null; }

const REFRESH_MS = 5 * 60 * 1000;

export const IndexBar: React.FC = () => {
  const [items, setItems] = useState<Idx[]>([]);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const collected: Idx[] = [];

    try {
      const [kse, kmi] = await Promise.all([
        fetchIndexQuote('KSE100'),
        fetchIndexQuote('KMI30'),
      ]);
      if (kse) collected.push({ label: 'KSE-100', value: kse.value, changePct: kse.changePct });
      if (kmi) collected.push({ label: 'KMI-30', value: kmi.value, changePct: kmi.changePct });
    } catch { /* ignore */ }

    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/USD?t=${Date.now()}`);
      const data = await res.json();
      const pkr = data?.rates?.PKR;
      if (pkr) collected.push({ label: 'USD/PKR', value: pkr, changePct: null });
    } catch { /* ignore */ }

    if (collected.length) setItems(collected);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    load();
    const tick = () => { if (isPsxMarketHours()) load(); };
    const t = setInterval(tick, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-6 flex-wrap bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl px-5 py-2.5 shadow-card dark:shadow-card-dark">
      {items.map((it, i) => {
        const up = (it.changePct ?? 0) >= 0;
        return (
          <div key={it.label} className="flex items-center gap-2.5">
            {i > 0 && <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 -ml-3 mr-1" />}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{it.label}</span>
            <span className="text-sm font-display font-black text-slate-900 dark:text-white tabular-nums">
              {it.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {it.changePct != null && (
              <span className={`text-xs font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                {up ? '+' : ''}{it.changePct.toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
