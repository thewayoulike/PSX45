import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Layers, Loader2 } from 'lucide-react';
import { fetchHourlyBars, fetchTechnicalScanBars } from '../services/technicalScanData';
import { TIMEFRAME_LABELS, timeframeAgreement, type FrameTrend, type TimeframeAgreement as Agreement, type Trend } from '../utils/timeframeAgreement';
import { PK_TIMEZONE } from '../utils/dates';

const TONE: Record<Trend | 'none', string> = {
  up: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  down: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  sideways: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  none: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const TrendIcon: React.FC<{ trend: Trend | null; size?: number }> = ({ trend, size = 12 }) =>
  trend === 'up' ? <ArrowUpRight size={size} aria-hidden="true" />
  : trend === 'down' ? <ArrowDownRight size={size} aria-hidden="true" />
  : trend === 'sideways' ? <ArrowRight size={size} aria-hidden="true" />
  : <span aria-hidden="true">–</span>;

const trendWord = (t: Trend | null) => t ?? 'not enough data';

/** Compact badge, e.g. "1D ↑ 1W ↑ · 2 of 2 up". */
export const TimeframeBadge: React.FC<{ agreement: Agreement; className?: string }> = ({ agreement, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${TONE[agreement.aligned ?? 'none']} ${className}`}
    title={`${agreement.frames.map((f) => `${TIMEFRAME_LABELS[f.timeframe]}: ${trendWord(f.trend)}`).join(' · ')}. ${agreement.note}`}
  >
    {agreement.frames.map((f) => (
      <span key={f.timeframe} className="inline-flex items-center" aria-label={`${TIMEFRAME_LABELS[f.timeframe]} ${trendWord(f.trend)}`}>
        {f.timeframe}<TrendIcon trend={f.trend} size={11} />
      </span>
    ))}
    <span aria-hidden="true">·</span>{agreement.label}
  </span>
);

const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const asOf = (f: FrameTrend) => f.asOf == null ? '' : new Date(f.asOf).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', timeZone: PK_TIMEZONE, ...(f.timeframe === '1H' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
});

/** Loads one stock's daily and hourly candles and shows the three trends side by side. */
export const TimeframeAgreementCard: React.FC<{ symbol: string; daily?: import('../services/psxData').OhlcBar[] }> = ({ symbol, daily }) => {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [hourlyPending, setHourlyPending] = useState(true);

  useEffect(() => {
    let live = true;
    setAgreement(null);
    setHourlyPending(true);
    const dailyBars = daily ? Promise.resolve(daily) : fetchTechnicalScanBars(symbol).catch(() => []);
    void dailyBars.then((d) => {
      if (!live) return;
      // Daily and weekly first; hourly fills in when it arrives.
      setAgreement(timeframeAgreement(d, null));
      void fetchHourlyBars(symbol).then((h) => {
        if (!live) return;
        setAgreement(timeframeAgreement(d, h));
        setHourlyPending(false);
      });
    });
    return () => { live = false; };
  }, [symbol, daily]);

  return (
    <section aria-label={`${symbol} trend by timeframe`} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Layers size={16} className="text-indigo-500" /> Trend by timeframe</h4>
        {agreement && !hourlyPending && <TimeframeBadge agreement={agreement} />}
        {hourlyPending && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 size={12} className="animate-spin" /> Loading hourly candles…</span>}
      </div>
      {agreement ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(['1H', '1D', '1W'] as const).map((tf) => {
              const f = agreement.frames.find((x) => x.timeframe === tf);
              const loading = tf === '1H' && hourlyPending;
              return (
                <div key={tf} className={`rounded-xl border p-3 ${TONE[f?.trend ?? 'none']}`}>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{TIMEFRAME_LABELS[tf]}</div>
                  <div className="flex items-center gap-1 text-base font-black capitalize mt-0.5">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <TrendIcon trend={f?.trend ?? null} size={16} />}
                    {loading ? 'Loading' : f?.trend ?? 'No data'}
                  </div>
                  {f && f.trend && <div className="text-[10px] font-medium opacity-80 mt-1 tabular-nums">Close {fmt(f.close)} · EMA 20 {fmt(f.emaFast)} · EMA 50 {fmt(f.emaSlow)}</div>}
                  {f && !f.trend && !loading && <div className="text-[10px] font-medium opacity-80 mt-1">{f.bars} candles; 50 needed</div>}
                  {f?.asOf != null && !loading && <div className="text-[10px] opacity-70 mt-0.5">Last candle {asOf(f)}</div>}
                </div>
              );
            })}
          </div>
          {!hourlyPending && <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">{agreement.note}</p>}
        </>
      ) : (
        <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading candles…</p>
      )}
      <p className="text-[10px] text-slate-400 mt-2">Up: close above the 20-period EMA and the 20 EMA above the 50 EMA. Down: both below. Anything else is sideways. Weekly candles are built from daily closes. Not investment advice.</p>
    </section>
  );
};
