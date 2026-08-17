import React, { useMemo, useState } from 'react';
import { Holding } from '../types';
import { AllocationChart } from './AllocationChart';
import { Layers, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

interface SectorRow {
  sector: string;
  count: number;
  invested: number;
  value: number;
  pl: number;
  plPct: number;
  weight: number;
  holdings: Array<{ ticker: string; value: number; pl: number; plPct: number; weight: number }>;
}

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export const SectorView: React.FC<Props> = ({ holdings, onSelectTicker }) => {
  const [open, setOpen] = useState<string | null>(null);

  const { rows, totalValue } = useMemo(() => {
    const map = new Map<string, SectorRow>();
    let total = 0;
    holdings.forEach(h => {
      if (!h.quantity) return;
      const sector = h.sector || 'Unknown Sector';
      const value = h.quantity * (h.currentPrice || 0);
      const invested = h.quantity * (h.avgPrice || 0);
      total += value;
      if (!map.has(sector)) map.set(sector, { sector, count: 0, invested: 0, value: 0, pl: 0, plPct: 0, weight: 0, holdings: [] });
      const r = map.get(sector)!;
      r.count += 1;
      r.invested += invested;
      r.value += value;
      r.holdings.push({ ticker: h.ticker, value, pl: value - invested, plPct: invested > 0 ? ((value - invested) / invested) * 100 : 0, weight: 0 });
    });
    const rows = Array.from(map.values()).map(r => {
      r.pl = r.value - r.invested;
      r.plPct = r.invested > 0 ? (r.pl / r.invested) * 100 : 0;
      r.weight = total > 0 ? (r.value / total) * 100 : 0;
      r.holdings = r.holdings
        .map(h => ({ ...h, weight: total > 0 ? (h.value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
      return r;
    }).sort((a, b) => b.value - a.value);
    return { rows, totalValue: total };
  }, [holdings]);

  if (holdings.length === 0) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-12 text-center">
          <Layers size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No holdings yet — add transactions to see your sector breakdown.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AllocationChart holdings={holdings} />
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={16} className="text-indigo-500" />
            <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">Sector Breakdown</h3>
            <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· {rows.length} sectors · {rs(totalValue)}</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(r => {
              const up = r.pl >= 0;
              const isOpen = open === r.sector;
              return (
                <div key={r.sector}>
                  <button onClick={() => setOpen(isOpen ? null : r.sector)} className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors rounded-lg px-1">
                    <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 dark:text-white text-sm truncate">{r.sector}</div>
                      <div className="text-[11px] text-slate-400">{r.count} {r.count === 1 ? 'stock' : 'stocks'} · {r.weight.toFixed(1)}% of portfolio</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">{rs(r.value)}</div>
                      <div className={`text-[11px] font-bold tabular-nums flex items-center gap-1 justify-end ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {pct(r.plPct)}
                      </div>
                    </div>
                    {/* weight bar */}
                    <div className="hidden sm:block w-24 shrink-0">
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, r.weight)}%` }} />
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pb-3 pl-8 pr-1 space-y-1">
                      {r.holdings.map(h => {
                        const hu = h.pl >= 0;
                        return (
                          <button key={h.ticker} onClick={() => onSelectTicker?.(h.ticker)} className="w-full flex items-center gap-3 py-1.5 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 transition-colors">
                            <span className="font-display font-black text-slate-700 dark:text-slate-200 text-xs w-20 truncate">{h.ticker}</span>
                            <span className="text-[11px] text-slate-400 flex-1">{h.weight.toFixed(1)}%</span>
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">{rs(h.value)}</span>
                            <span className={`text-xs font-bold tabular-nums w-16 text-right ${hu ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{pct(h.plPct)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
