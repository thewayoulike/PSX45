import React from 'react';
import { Lock } from 'lucide-react';
import { PK_TIMEZONE } from '../utils/dates';
import {
  CANDLE_PATTERN_LABELS, MIN_PATTERN_SAMPLES, PATTERN_HORIZON_SESSIONS, type CandleScanHit, type RiseRecord,
} from '../utils/candlePatternScan';

export interface CandleRow extends CandleScanHit {
  symbol: string;
  current: number;
  changePct: number;
  volume: number;
  baseline: RiseRecord;
}

const pct = (n: number | null, signed = false) =>
  n == null || !Number.isFinite(n) ? '—' : `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(signed ? 2 : 0)}%`;

const DIRECTION_STYLE = {
  bullish: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  bearish: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const when = (r: CandleRow) =>
  `${r.sessionsAgo === 0 ? 'Latest candle' : r.sessionsAgo === 1 ? '1 session ago' : `${r.sessionsAgo} sessions ago`} · ${new Date(r.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: PK_TIMEZONE })}`;

/** Percentage points between this pattern's rise rate and the stock's normal rise rate. */
const edge = (r: CandleRow) =>
  r.record.risePct == null || r.baseline.risePct == null ? null : r.record.risePct - r.baseline.risePct;

export const CandlePatternResults: React.FC<{
  rows: CandleRow[];
  onChart?: (symbol: string) => void;
  lockedFrom?: number;
  onUpgrade?: () => void;
}> = ({ rows, onChart, lockedFrom = Infinity, onUpgrade }) => {
  const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ${className}`}>{children}</th>
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-x-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-500">
      <table className="w-full text-sm min-w-[880px] whitespace-nowrap">
        <thead className="bg-slate-50/95 dark:bg-slate-900/95 text-left border-b border-slate-200 dark:border-slate-800">
          <tr>
            <Th>Symbol</Th>
            <Th>Pattern</Th>
            <Th className="text-right">Price</Th>
            <Th className="text-right">Chg %</Th>
            <Th className="text-right">Seen in past year</Th>
            <Th className="text-right">Rose within {PATTERN_HORIZON_SESSIONS} sessions</Th>
            <Th className="text-right">Avg move</Th>
            <Th className="text-right">Stock’s usual</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {rows.map((r, idx) => {
            const locked = idx >= lockedFrom;
            const thin = r.record.samples < MIN_PATTERN_SAMPLES;
            const e = edge(r);
            return (
              <tr key={`${r.symbol}-${r.type}-${r.time}`} className="even:bg-slate-50/50 dark:even:bg-slate-800/20">
                <td className="px-4 py-3">
                  {locked ? (
                    <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 font-display font-black text-indigo-600 dark:text-indigo-400 hover:underline">
                      <Lock size={12} /> Pay to see
                    </button>
                  ) : (
                    <button type="button" onClick={() => onChart?.(r.symbol)} className="font-display font-black text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400">{r.symbol}</button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${DIRECTION_STYLE[r.direction]}`}>{CANDLE_PATTERN_LABELS[r.type]}</span>
                  <div className="text-[11px] text-slate-500 mt-1">{when(r)}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">{locked ? '•••' : r.current.toFixed(2)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${r.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{locked ? '—' : pct(r.changePct, true)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{locked ? '—' : `${r.record.samples}×`}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {locked ? '—' : r.record.samples === 0 ? <span className="text-slate-400">No past cases</span> : (
                    <>
                      <span className={`font-mono font-bold ${thin ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>{pct(r.record.risePct)}</span>
                      <span className="text-[11px] text-slate-500"> · {r.record.rose} of {r.record.samples}</span>
                      {thin && <div className="text-[10px] text-slate-400">Too few to judge</div>}
                    </>
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums ${thin ? 'text-slate-400' : (r.record.avgMovePct ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{locked ? '—' : pct(r.record.avgMovePct, true)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {locked ? '—' : (
                    <>
                      <span className="font-mono text-slate-600 dark:text-slate-300">{pct(r.baseline.risePct)}</span>
                      {e != null && !thin && (
                        <div className={`text-[10px] font-bold ${Math.round(e) === 0 ? 'text-slate-500' : e > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                          {Math.round(e) === 0 ? 'Same as usual' : `Pattern ${e > 0 ? '+' : '−'}${Math.abs(Math.round(e))} pts`}
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
