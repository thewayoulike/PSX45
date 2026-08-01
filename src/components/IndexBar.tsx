import React, { useState, useEffect, useCallback } from 'react';
import { fetchUrlWithFallback } from '../services/psxData';

interface Idx { label: string; value: number; changePct: number | null; }

const num = (s?: string | null) => {
  const v = parseFloat((s || '').replace(/,/g, '').replace('%', '').trim());
  return isNaN(v) ? 0 : v;
};

// Parse the PSX indices page for KSE100 / KMI30 (value + change %).
const parseIndices = (html: string): Record<string, Idx> => {
  const out: Record<string, Idx> = {};
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim());
    if (cells.length < 3) return;
    const key = cells.join(' ').toUpperCase();
    const nums = cells.map(num).filter(n => n !== 0);
    if (key.includes('KSE') && key.includes('100')) {
      out['KSE-100'] = { label: 'KSE-100', value: nums[0] || 0, changePct: extractPct(cells) };
    } else if (key.includes('KMI') && key.includes('30')) {
      out['KMI-30'] = { label: 'KMI-30', value: nums[0] || 0, changePct: extractPct(cells) };
    }
  });
  return out;
};
const extractPct = (cells: string[]): number | null => {
  const pctCell = cells.find(c => c.includes('%'));
  return pctCell ? num(pctCell) : null;
};

export const IndexBar: React.FC = () => {
  const [items, setItems] = useState<Idx[]>([]);

  const load = useCallback(async () => {
    const collected: Idx[] = [];

    // PSX indices (KSE-100, KMI-30)
    try {
      const html = await fetchUrlWithFallback('https://dps.psx.com.pk/indices');
      if (html) {
        const parsed = parseIndices(html);
        if (parsed['KSE-100']) collected.push(parsed['KSE-100']);
        if (parsed['KMI-30']) collected.push(parsed['KMI-30']);
      }
    } catch { /* ignore */ }

    // USD / PKR (free, CORS-open forex API)
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
