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
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-1 py-0.5">
      {items.map((it, i) => {
        const up = (it.changePct ?? 0) >= 0;
        return (
          <div key={it.label} className="flex items-center gap-2">
            {i > 0 && (
              <span
                className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700 mr-3"
                aria-hidden
              />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {it.label}
            </span>
            <span className="text-sm font-display font-bold text-slate-900 dark:text-white tabular-nums">
              {it.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {it.changePct != null && (
              <span
                className={`text-[11px] font-bold tabular-nums ${
                  up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                }`}
              >
                {up ? '+' : ''}
                {it.changePct.toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
