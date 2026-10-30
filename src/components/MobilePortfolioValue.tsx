import React, { useEffect, useId, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Customized, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MobileFitLine } from './MobileFitLine';
import type { HistoryRow } from '../utils/cardHistory';
import { portfolioValueSeries, valueRanges, type ValueRange } from '../utils/portfolioValueSeries';
import { todayPK } from '../utils/dates';
import { readObservations, writeObservations, type HistoryScope } from '../utils/portfolioHistoryCache';
import { netInvestedOnDate, type NetInvestedPoint } from '../utils/peakCapital';
import './PortfolioValue.css';
import { PortfolioInvestedComparison } from './PortfolioInvestedComparison';

type Props = { rows: HistoryRow[]; netInvestedHistory?: readonly NetInvestedPoint[]; value: number; dayChange: number | null; sessionDate?: string; quoteTime?: string | null;
  scope?: HistoryScope; loading?: boolean; error?: string; onRefresh?: () => void };
const money = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const axisMoney = (amount: number) => `Rs. ${new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`;
export function MobilePortfolioValue({ rows, netInvestedHistory, value, dayChange, sessionDate, quoteTime, scope, loading, error, onRefresh }: Props) {
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
  const history = useMemo(() => portfolioValueSeries(rows, range, asOf, netInvestedHistory), [rows, range, asOf, netInvestedHistory]);
  // Transactions have dates, not execution times: intraday values share that day's
  // invested balance. The ledger-specific cache prevents mixing different ledgers.
  const data = range === '1D' ? observed.map(p => ({ label: `${dateLabel(asOf)} · ` + new Date(p.time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }) + ' PKT', value: p.value,
      netInvested: netInvestedHistory ? netInvestedOnDate(netInvestedHistory, asOf) : undefined }))
    : history.map(p => ({ label: dateLabel(p.date), value: p.value, netInvested: p.netInvested }));
  const up = data.length > 1 ? data[data.length - 1].value >= data[0].value : (dayChange ?? 0) >= 0;
  const color = up ? 'var(--clean-up)' : 'var(--clean-down)';
  return <section className="portfolio-value-preview" aria-label="Portfolio value history">
    <div className="portfolio-value-heading"><div className="min-w-0 w-full"><p>Portfolio value <span>Including cash</span></p>
      <h2><MobileFitLine max={28}>Rs. {money(value)}</MobileFitLine></h2>
      <div className="portfolio-value-change">Day’s change <strong style={{ color: (dayChange ?? 0) >= 0 ? 'var(--clean-up)' : 'var(--clean-down)' }}>{dayChange == null ? 'Prices incomplete' : `${dayChange >= 0 ? '+' : '−'}Rs. ${money(Math.abs(dayChange))}`}</strong></div>
      <div className="portfolio-value-asof">{quoteTime ? `Updated ${new Date(quoteTime).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} PKT` : 'Latest saved portfolio'}</div>
    </div></div>
    <div className="portfolio-value-legend" aria-label="Chart lines">
      {netInvestedHistory ? <>
        <span><i aria-hidden="true" style={{ borderColor: 'var(--clean-up)' }}/>Above invested</span>
        <span><i aria-hidden="true" style={{ borderColor: 'var(--clean-down)' }}/>Below invested</span>
        <span><i aria-hidden="true" className="portfolio-invested-key"/>Net invested</span>
      </> : <span><i aria-hidden="true" style={{ borderColor: color }}/>Portfolio value</span>}
    </div>
    {data.length > 1 ? <div className="portfolio-value-plot" aria-label={`${range} portfolio value compared with net invested; use arrow keys to inspect dates`}><ResponsiveContainer width="100%" height="100%"><ComposedChart accessibilityLayer data={data} margin={{ top: 12, right: 6, bottom: 0, left: 6 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.23}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="var(--clean-line)" strokeDasharray="3 5"/>
      <XAxis dataKey="label" hide/>
      <YAxis domain={['auto', 'auto']} orientation="right" width={66} tickCount={4} interval="preserveStartEnd" tickLine={false} axisLine={false} tickMargin={8}
        tick={({ x, y, payload }) => <text x={x} y={y} textAnchor="start" dominantBaseline="central" fill="var(--clean-muted)" fontSize={10}>{axisMoney(payload.value)}</text>}/>
      <Tooltip content={({ active, label, payload }) => {
        const point = payload?.[0]?.payload as { value: number; netInvested?: number } | undefined;
        if (!active || !point) return null;
        const difference = typeof point.netInvested === 'number' ? Math.round((point.value - point.netInvested) * 100) / 100 : null;
        return <div className="portfolio-value-tooltip">
          <strong>{label}</strong>
          <dl><div><dt>Portfolio value</dt><dd>Rs. {money(point.value)}</dd></div>
            {difference !== null && <div><dt>Net invested</dt><dd>Rs. {money(point.netInvested!)}</dd></div>}</dl>
          {difference !== null && <p style={{ color: difference > 0 ? 'var(--clean-up)' : difference < 0 ? 'var(--clean-down)' : 'var(--clean-muted)' }}>
            {difference === 0 ? 'Equal to net invested' : `Rs. ${money(Math.abs(difference))} ${difference > 0 ? 'above' : 'below'} net invested`}
          </p>}
        </div>;
      }}/>
      {netInvestedHistory && <Customized component={PortfolioInvestedComparison}/>}
      <Area name="Portfolio value" dataKey="value" type="linear" stroke={netInvestedHistory ? 'none' : color} strokeWidth={2} fill={netInvestedHistory ? 'none' : `url(#${id})`} isAnimationActive={false}
        activeDot={props => <circle cx={props.cx} cy={props.cy} r={4} fill={typeof props.payload?.netInvested === 'number' ? props.payload.value >= props.payload.netInvested ? 'var(--clean-up)' : 'var(--clean-down)' : color} stroke="var(--clean-surface)" strokeWidth={2}/>}/>
      {netInvestedHistory && <Line name="Net invested" dataKey="netInvested" type="stepAfter" stroke="var(--portfolio-invested-color)" strokeDasharray="6 4" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false}/>}
    </ComposedChart></ResponsiveContainer></div> : <p className="portfolio-value-empty" role="status">{range === '1D' ? 'Intraday values are saved as prices update while this page is open. Choose 1M for daily history.' : loading ? 'Loading portfolio history…' : 'Not enough portfolio values are available for this period yet.'}</p>}
    <div className="portfolio-value-ranges" aria-label="Portfolio chart period">{valueRanges.map(period => <button key={period} type="button" aria-pressed={range === period} onClick={() => setRange(period)}>{period}</button>)}</div>
    <div className="portfolio-value-footnote" aria-live="polite">
      {loading ? (data.length > 1 ? 'Showing saved history · checking for updates…' : 'Fetching available daily history…') : error || ''}
      {onRefresh && <button type="button" className="ml-2 underline disabled:opacity-50" disabled={loading} onClick={onRefresh}>Refresh history</button>}
    </div>
    <p className="portfolio-value-footnote">{range !== '1D' && history.length > 0 ? `Available records: ${dateLabel(history[0].date)}–${dateLabel(history[history.length - 1].date)}. ` : ''}Account value includes deposits and withdrawals; it is not a return percentage.</p>
    {netInvestedHistory && <p className="portfolio-value-footnote">Hover or tap the chart to compare values. Net invested follows the Capital card’s calculation using transactions through each date{range === '1D' ? ', with one invested balance for the day' : ''}.</p>}
  </section>;
}
