import React, { useEffect, useId, useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MobileFitLine } from './MobileFitLine';
import type { HistoryRow } from '../utils/cardHistory';
import { portfolioValueSeries, valueRanges, type ValueRange } from '../utils/portfolioValueSeries';
import { todayPK } from '../utils/dates';
import { readObservations, writeObservations, type HistoryScope } from '../utils/portfolioHistoryCache';

type Props = { rows: HistoryRow[]; value: number; dayChange: number | null; sessionDate?: string; quoteTime?: string | null;
  scope?: HistoryScope; loading?: boolean; error?: string; onRefresh?: () => void };
const money = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function MobilePortfolioValue({ rows, value, dayChange, sessionDate, quoteTime, scope, loading, error, onRefresh }: Props) {
  const [range, setRange] = useState<ValueRange>('1M');
  const id = useId().replace(/:/g, '');
  const asOf = sessionDate || todayPK();
  const quote = quoteTime ? Date.parse(quoteTime) : NaN;
  const scopeId = JSON.stringify(scope);
  const [observations, setObservations] = useState(() => ({ date: asOf, scopeId, points: scope ? readObservations(scope, asOf) : [] }));
  const observed = observations.date === asOf && observations.scopeId === scopeId ? observations.points : (scope ? readObservations(scope, asOf) : []);
  useEffect(() => {
    if (!Number.isFinite(quote) || !Number.isFinite(value) || dayChange === null) return;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(quote));
    if (date !== asOf) return;
    const points = [...observed.filter(p => p.time !== quote), { time: quote, value }].sort((a, b) => a.time - b.time).slice(-500);
    setObservations({ date: asOf, scopeId, points });
    if (scope) writeObservations(scope, asOf, points);
  }, [quote, value, asOf, dayChange, scopeId]);
  const history = useMemo(() => portfolioValueSeries(rows, range, asOf), [rows, range, asOf]);
  const data = range === '1D' ? observed.map(p => ({ label: new Date(p.time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }) + ' PKT', value: p.value }))
    : history.map(p => ({ label: dateLabel(p.date), value: p.value }));
  const up = data.length > 1 ? data[data.length - 1].value >= data[0].value : (dayChange ?? 0) >= 0;
  const color = up ? 'var(--clean-up)' : 'var(--clean-down)';
  return <section className="portfolio-value-preview" aria-label="Portfolio value history">
    <div className="portfolio-value-heading"><div className="min-w-0 w-full"><p>Portfolio value <span>Including cash</span></p>
      <h2><MobileFitLine max={28}>Rs. {money(value)}</MobileFitLine></h2>
      <div className="portfolio-value-change">Day’s change <strong style={{ color: (dayChange ?? 0) >= 0 ? 'var(--clean-up)' : 'var(--clean-down)' }}>{dayChange == null ? 'Prices incomplete' : `${dayChange >= 0 ? '+' : '−'}Rs. ${money(Math.abs(dayChange))}`}</strong></div>
      <div className="portfolio-value-asof">{quoteTime ? `Updated ${new Date(quoteTime).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} PKT` : 'Latest saved portfolio'}</div>
    </div></div>
    {data.length > 1 ? <div className="portfolio-value-plot" aria-label={`${range} recorded portfolio values`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.23}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <XAxis dataKey="label" hide/><YAxis domain={['auto', 'auto']} hide/>
      <Tooltip formatter={(amount: number) => [`Rs. ${money(amount)}`, 'Portfolio value']} contentStyle={{ background: 'var(--clean-surface)', borderColor: 'var(--clean-line)', borderRadius: 10, fontSize: 11, color: 'var(--clean-ink)' }}/>
      <Area dataKey="value" type="linear" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false}/>
    </AreaChart></ResponsiveContainer></div> : <p className="portfolio-value-empty" role="status">{range === '1D' ? 'Intraday values are saved as prices update while this page is open. Choose 1M for daily history.' : loading ? 'Loading portfolio history…' : 'Not enough portfolio values are available for this period yet.'}</p>}
    <div className="portfolio-value-ranges" aria-label="Portfolio chart period">{valueRanges.map(period => <button key={period} type="button" aria-pressed={range === period} onClick={() => setRange(period)}>{period}</button>)}</div>
    <div className="portfolio-value-footnote" aria-live="polite">
      {loading ? (data.length > 1 ? 'Showing saved history · checking for updates…' : 'Fetching available daily history…') : error || ''}
      {onRefresh && <button type="button" className="ml-2 underline disabled:opacity-50" disabled={loading} onClick={onRefresh}>Refresh history</button>}
    </div>
    <p className="portfolio-value-footnote">{range !== '1D' && history.length > 0 ? `Available records: ${dateLabel(history[0].date)}–${dateLabel(history[history.length - 1].date)}. ` : ''}Account value includes deposits and withdrawals; it is not a return percentage.</p>
  </section>;
}
