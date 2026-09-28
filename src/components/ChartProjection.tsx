import React from 'react';
import { PROJECTION_HORIZONS, type ChartProjection, type ProjectionHorizon, type ProjectionResult } from '../utils/chartProjection';
import type { ChartTheme } from '../utils/chartTheme';

const price = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, base: number) => `${n >= base ? '+' : ''}${((n / base - 1) * 100).toFixed(2)}%`;
const date = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });

export function ProjectionControls({ enabled, onToggle, horizon, onHorizon, onRecenter, supported }: {
  enabled: boolean; onToggle: () => void; horizon: ProjectionHorizon; onHorizon: (h: ProjectionHorizon) => void;
  onRecenter: () => void; supported: boolean;
}) {
  return <div className="px-3 py-2 border-b border-slate-200/60 dark:border-slate-800 text-xs shrink-0">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={enabled} onClick={onToggle} className={`px-3 py-2 rounded-lg border font-bold ${enabled ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
        Projected range · {enabled ? 'On' : 'Off'}
      </button>
      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Private beta</span>
      {enabled && <><span className="text-[10px] font-bold text-slate-500">Illustrative</span>
        <div className="flex items-center gap-1 ml-auto" role="group" aria-label="Projection horizon">
          {PROJECTION_HORIZONS.map(h => <button key={h} type="button" aria-label={`${h} ${h === 1 ? 'session' : 'sessions'}`} aria-pressed={horizon === h} onClick={() => onHorizon(h)} className={`min-w-[36px] min-h-[36px] rounded-lg font-bold ${horizon === h ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{h}</button>)}
          <span className="ml-1 text-[10px] text-slate-500">sessions</span>
        </div>
        {supported && <button type="button" onClick={onRecenter} className="px-2 py-2 text-emerald-700 dark:text-emerald-300 font-bold underline underline-offset-2">Show range</button>}
      </>}
    </div>
    {enabled && !supported && <p className="mt-2 text-slate-500">Select daily candles to see the projected range.</p>}
  </div>;
}

export function ProjectionSummary({ result }: { result: ProjectionResult }) {
  if (!result.data) return <p role="status" className="m-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">{result.reason}</p>;
  const { referenceClose, referenceTime, points, atr, evidence } = result.data, end = points[points.length - 1];
  return <section aria-label="Projected range details" className="px-2 py-3 text-xs text-slate-600 dark:text-slate-300">
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
      <p><strong className="text-slate-900 dark:text-white">Illustrative closing-price range</strong> · {end.session} {end.session === 1 ? 'session' : 'sessions'} ahead</p>
      <p>Reference: {date(referenceTime)} · close {price(referenceClose)}</p>
    </div>
    {evidence && <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="font-bold text-slate-900 dark:text-white">{evidence.method === 'indicator-matched-v2' ? 'Indicator-informed range' : 'Historical baseline selected'} · {end.median > referenceClose ? 'median above reference' : end.median < referenceClose ? 'median below reference' : 'flat median'}</p>
      <p className="text-[11px]">{evidence.reason}</p>
      <p><strong>Candles:</strong> {evidence.context.patterns.length ? evidence.context.patterns.join(' · ') : 'No listed pattern on the latest candle'}. {evidence.context.recent}</p>
      <p><strong>Trend:</strong> {evidence.context.trend}. <strong>Volume:</strong> {evidence.context.volume}.</p>
      <details><summary className="cursor-pointer font-bold py-1">Inputs and historical check</summary><div className="mt-2 space-y-3 leading-relaxed">
        <p>{evidence.context.availableFeatures}/{evidence.context.totalFeatures} measurements available across seven equally weighted groups: {evidence.context.groups.join('; ')}. This prevents the many similar moving averages from dominating the match. {evidence.matchedWindows} comparable windows for this horizon. Missing readings are excluded, not treated as neutral.</p>
        <p>Candle inputs include body and wick proportions, doji, hammer, shooting star, engulfing, harami, inside/outside bars, morning/evening-star shapes, and sequences of three rising/falling candles. Recent returns and gaps, Bollinger position/width, 20-session price levels, relative volume and signed volume flow are also considered. Pattern rules are approximate and no single pattern guarantees direction.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] tabular-nums">{evidence.context.readings.map(r => <p key={r.name} className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 py-1"><span>{r.name}</span><strong>{r.value == null ? 'Unavailable' : price(r.value)}</strong></p>)}</div>
        <p>Recent historical check: {evidence.validation.cases} paired forecasts at {evidence.validation.horizon}-session spacing. Each used only information available at its reference candle. {evidence.validation.firstTime && evidence.validation.lastTime ? `References: ${date(evidence.validation.firstTime)} to ${date(evidence.validation.lastTime)}.` : 'More history is needed.'}</p>
        {evidence.validation.cases > 0 && <div className="overflow-x-auto"><table className="w-full text-right text-[10px] tabular-nums"><caption className="text-left font-bold mb-2">Same dates · lower errors are better</caption><thead><tr><th className="text-left">Measure</th><th>Indicators</th><th>Baseline</th></tr></thead><tbody>
          <tr><th className="text-left py-2">Median error (% of reference)</th><td>{evidence.validation.indicatorMaePct?.toFixed(2)}%</td><td>{evidence.validation.baselineMaePct?.toFixed(2)}%</td></tr>
          <tr><th className="text-left py-2">Wider-range coverage</th><td>{evidence.validation.indicatorCoveragePct?.toFixed(1)}%</td><td>{evidence.validation.baselineCoveragePct?.toFixed(1)}%</td></tr>
          <tr><th className="text-left py-2">Range error score</th><td>{evidence.validation.indicatorIntervalScorePct?.toFixed(2)}</td><td>{evidence.validation.baselineIntervalScorePct?.toFixed(2)}</td></tr>
        </tbody></table></div>}
        <p>Automatic selection requires at least 30 replays and improvement in both median error and range error. The range score penalizes wide bands and missed closes. These replays select the model; they are not an independent test of the selected model. Save projections to evaluate genuinely subsequent outcomes. This does not establish a trading win rate or calibrated probabilities.</p>
        <p>Only daily OHLCV information is used. News, fundamentals, order-book activity, manual drawings and intraday signals are not inputs. Historic adjustments and missing sessions can affect results.</p>
      </div></details>
    </div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-500/5 p-3">
        <p className="text-[10px] mb-1">Wider range · historical P10–P90</p><p className="font-bold text-slate-900 dark:text-white tabular-nums">{price(end.lower)} – {price(end.upper)}</p><p className="mt-1 text-[10px]">{pct(end.lower, referenceClose)} to {pct(end.upper, referenceClose)}</p>
      </div>
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-100/60 dark:bg-emerald-500/10 p-3">
        <p className="text-[10px] mb-1">Inner range · historical P25–P75</p><p className="font-bold text-slate-900 dark:text-white tabular-nums">{price(end.innerLower)} – {price(end.innerUpper)}</p><p className="mt-1 text-[10px]">{pct(end.innerLower, referenceClose)} to {pct(end.innerUpper, referenceClose)}</p>
      </div>
      <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex sm:block items-center justify-between gap-2">
        <p className="text-[10px] sm:mb-1">Historical median · dashed line</p><p className="font-bold text-slate-900 dark:text-white tabular-nums">{price(end.median)} <span className="font-normal text-[10px]">({pct(end.median, referenceClose)})</span></p>
      </div>
    </div>
    <p className="mt-2 text-[10px] leading-relaxed">Prices in chart units. Shading describes closing prices at each horizon, not intraday limits or a guaranteed future probability.</p>
    <details className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
      <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200 py-1">How this range is calculated</summary>
      <div className="mt-3 space-y-3 leading-relaxed">
        <p>For each horizon we consider up to 750 recent historical windows from this stock. Each closing-price change is divided by ATR(14) at its starting candle, then rescaled using the latest completed candle’s ATR ({price(atr)}). No fixed widening multipliers are applied.</p>
        {evidence?.method === 'indicator-matched-v2' && <p>The selected range uses the closest 20% of comparable setups, with at least 60 windows. Closeness uses the seven input groups with equal weight; fixed measurement scales are not fitted using future data. This is a statistical model, not an AI prediction or guaranteed direction.</p>}
        <p>P10–P90 and P25–P75 are historical percentiles; the dashed line is the historical median. These have not been validated as future probability bands. Overlapping windows are not independent observations. A range can narrow or shift between horizons.</p>
        <div className="overflow-x-auto"><table className="w-full text-[10px] text-right tabular-nums"><caption className="text-left mb-2 font-bold">Closing-price ranges by future session</caption><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="text-left py-2">Session</th><th>P10–P90</th><th>Median</th><th>Windows</th></tr></thead><tbody>{points.map(p => <tr key={p.session} className="border-b border-slate-100 dark:border-slate-800"><th className="text-left py-2">+{p.session}</th><td>{price(p.lower)}–{price(p.upper)}</td><td>{price(p.median)}</td><td>{p.samples}</td></tr>)}</tbody></table></div>
        <p>{end.session}-session sample: {end.samples} windows, origins from {date(end.firstOrigin)}. Outcomes end no later than {date(referenceTime)}. Today’s daily candle is excluded before 18:00 Pakistan time. Sessions are observed daily bars, not calendar days; future holidays are not predicted.</p>
        <p>Uses the chart’s supplied history. Missing sessions, stale prices, splits and unadjusted dividends can distort ranges. Verify the reference date and price history. This is a price scenario, not a target or a trading signal.</p>
      </div>
    </details>
    <p className="mt-3 text-[10px] text-slate-500">Not investment advice. Do your own research and assess your risk before investing.</p>
  </section>;
}

/** Draws in the existing candle coordinates; no canvas, chart package or extra fetch. */
export function ProjectionFan({ data, anchorIndex, xAt, yScale, top, bottom, theme, compact = false }: {
  data: ChartProjection; anchorIndex: number; xAt: (i: number) => number; yScale: (p: number) => number;
  top: number; bottom: number; theme: ChartTheme;
  compact?: boolean;
}) {
  const origin = `${xAt(anchorIndex)},${yScale(data.referenceClose)}`;
  const shape = (low: 'lower' | 'innerLower', high: 'upper' | 'innerUpper') => `${origin} ${data.points.map(p => `${xAt(anchorIndex + p.session)},${yScale(p[high])}`).join(' ')} ${[...data.points].reverse().map(p => `${xAt(anchorIndex + p.session)},${yScale(p[low])}`).join(' ')}`;
  const last = data.points[data.points.length - 1];
  return <g data-projection-fan="true" pointerEvents="none" role="img" aria-label={`Illustrative range for ${last.session} sessions after the latest completed candle`}>
    <title>Historical price scenarios. Not validated forecast probabilities.</title>
    <line x1={xAt(anchorIndex)} x2={xAt(anchorIndex)} y1={top + 16} y2={bottom} stroke={theme.mutedText} strokeDasharray="3 4" opacity=".6" />
    <polygon points={shape('lower', 'upper')} fill="#10b981" fillOpacity={theme.isDark ? .14 : .1} stroke="#10b981" strokeOpacity=".4" strokeWidth="1" />
    <polygon points={shape('innerLower', 'innerUpper')} fill="#10b981" fillOpacity={theme.isDark ? .25 : .23} />
    <polyline points={`${origin} ${data.points.map(p => `${xAt(anchorIndex + p.session)},${yScale(p.median)}`).join(' ')}`} fill="none" stroke={theme.axisText} strokeWidth="1.5" strokeDasharray="4 4" />
    <circle cx={xAt(anchorIndex)} cy={yScale(data.referenceClose)} r="3" fill={theme.axisText} />
    <line x1={xAt(anchorIndex + last.session)} x2={xAt(anchorIndex + last.session)} y1={yScale(last.lower)} y2={yScale(last.upper)} stroke="#059669" strokeWidth="1.5" />
    <text x={xAt(anchorIndex)} y={top + (compact ? 28 : 12)} textAnchor="end" dx="-5" fill={theme.mutedText} fontSize="9">Last close</text>
    <text x={xAt(anchorIndex + last.session)} y={top + (compact ? 28 : 12)} textAnchor="end" fill={theme.mutedText} fontSize="9">+{last.session} {last.session === 1 ? 'session' : 'sessions'}</text>
  </g>;
}
