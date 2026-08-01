import React, { useMemo } from 'react';
import { Holding, PortfolioStats } from '../types';
import { Scale } from 'lucide-react';

interface Props {
  holdings: Holding[];
  stats: PortfolioStats;
}

// DEV NOTE (not shown to users): these are approximate KSE-100 sector weights (%).
// Edit the KEYS to exactly match the sector strings your getSector()/sectorOverrides
// produce, and refresh the weights from PSX periodically. Unmatched sectors compare
// against 0.
const KSE100_SECTOR_WEIGHTS: Record<string, number> = {
  'Commercial Banks': 28,
  'Oil & Gas Exploration Companies': 14,
  'Fertilizer': 9,
  'Cement': 7,
  'Power Generation & Distribution': 5,
  'Oil & Gas Marketing Companies': 4,
  'Technology & Communication': 5,
  'Automobile Assembler': 3,
  'Pharmaceuticals': 3,
  'Textile Composite': 3,
  'Chemical': 3,
  'Food & Personal Care Products': 4,
  'Engineering': 2,
};

export const SectorTilt: React.FC<Props> = ({ holdings, stats }) => {
  const rows = useMemo(() => {
    const total = stats.totalValue || holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0) || 1;
    const mine: Record<string, number> = {};
    holdings.forEach(h => {
      const s = h.sector || 'Other';
      mine[s] = (mine[s] || 0) + h.currentPrice * h.quantity;
    });
    const sectors = new Set<string>([...Object.keys(mine), ...Object.keys(KSE100_SECTOR_WEIGHTS)]);
    return Array.from(sectors)
      .map(sector => {
        const yourW = ((mine[sector] || 0) / total) * 100;
        const idxW = KSE100_SECTOR_WEIGHTS[sector] || 0;
        return { sector, yourW, idxW, diff: yourW - idxW };
      })
      .filter(r => Math.abs(r.diff) >= 1)          // only meaningful tilts
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 6);
  }, [holdings, stats.totalValue]);

  if (holdings.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-4">
        <Scale size={16} className="text-blue-500" /> Sector Tilt vs KSE-100
      </h3>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">Your sector mix closely tracks the index.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => {
            const over = r.diff >= 0;
            const mag = Math.min(100, (Math.abs(r.diff) / 15) * 100); // scale bar; 15% dev = full
            return (
              <div key={r.sector} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex-1 truncate" title={r.sector}>{r.sector}</span>
                <span className="text-[10px] text-slate-400 tabular-nums w-24 text-right">{r.yourW.toFixed(1)}% vs {r.idxW}%</span>
                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${over ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${mag}%` }} />
                </div>
                <span className={`text-xs font-bold tabular-nums w-14 text-right ${over ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {over ? 'OW +' : 'UW −'}{Math.abs(r.diff).toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-3 leading-snug">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">OW</span> = overweight vs KSE-100 ·
        <span className="font-bold text-rose-500"> UW</span> = underweight. Your sector mix relative to the index; index weights are indicative.
      </p>
    </div>
  );
};
