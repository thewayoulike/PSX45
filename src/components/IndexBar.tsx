import React, { useState, useEffect, useCallback } from 'react';
import { fetchStockHistory } from '../services/psxData';

interface Idx { label: string; value: number; changePct: number | null; }

// Last value + close-to-close change from a fetchStockHistory series.
const lastChange = (arr: { time: number; price: number }[] | undefined): Idx | null => {
  if (!arr || arr.length < 2) return null;
  const a = arr[arr.length - 1].price;
  const b = arr[arr.length - 2].price;
  if (!a) return null;
  return { label: '', value: a, changePct: b > 0 ? ((a - b) / b) * 100 : null };
};

export const IndexBar: React.FC = () => {
  const [items, setItems] = useState<Idx[]>([]);

  const load = useCallback(async () => {
    const collected: Idx[] = [];

    // KSE-100 & KMI-30 from the SAME reliable source your PerformanceChart uses.
    try {
      const [kse, kmi] = await Promise.all([
        fetchStockHistory('KSE100', '1M'),
        fetchStockHistory('KMI30', '1M'),
      ]);
      const k = lastChange(kse); if (k) collected.push({ ...k, label: 'KSE-100' });
      const m = lastChange(kmi); if (m) collected.push({ ...m, label: 'KMI-30' });
    } catch { /* ignore */ }

    // USD/PKR (free forex source; may differ slightly from Google/interbank).
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      const pkr = data?.rates?.PKR;
      if (pkr) collected.push({ label: 'USD/PKR', value: pkr, changePct: null });
    } catch { /* ignore */ }

    if (collected.length) setItems(collected);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
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
