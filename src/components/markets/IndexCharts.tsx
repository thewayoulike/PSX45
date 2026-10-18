import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadMarketData } from '../../services/marketOverview';
import { aggregateIndexBars, indexPeriod, type IndexBar } from '../../services/indexChart';

const INDICES = ['KSE100', 'KMI30'] as const;
const PERIODS = [[1, '1M'], [3, '3M'], [6, '6M'], [12, '1Y'], [36, '3Y'], [60, '5Y'], [0, 'All']] as const;
const label = (symbol: string) => symbol === 'KSE100' ? 'KSE-100' : 'KMI-30';
const number = (value: number) => value.toLocaleString('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const date = (time: number) => new Date(time).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' });
const volume = (bar: IndexBar) => bar.volumeAvailable ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(bar.volume) : 'Not supplied';

export function IndexCharts() {
  const [symbol, setSymbol] = useState<typeof INDICES[number]>('KSE100');
  const [period, setPeriod] = useState(3), [interval, setInterval] = useState<'1D' | '1W' | '1M'>('1D');
  const [loaded, setLoaded] = useState<{ symbol: string; bars: IndexBar[] } | null>(null);
  const [error, setError] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null), [width, setWidth] = useState(800);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    loadMarketData(`index-ohlc:${symbol}`, attempt > 0).then(result => {
      if (active) setLoaded({ symbol, bars: result.data });
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [symbol, attempt]);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setHovered(null), [symbol, period, interval, loaded]);
  const history = loaded?.symbol === symbol ? loaded.bars : [];
  const daily = useMemo(() => indexPeriod(history, period || null), [history, period]);
  // Aggregate the full series before selecting the window, so the first weekly/monthly candle is not truncated.
  const bars = useMemo(() => aggregateIndexBars(history, interval).filter(bar => (bar.endTime ?? bar.time) >= (daily[0]?.time ?? Infinity)), [history, daily, interval]);
  const first = daily[0], last = daily.at(-1), current = bars[Math.min(hovered ?? bars.length - 1, bars.length - 1)];
  const low = bars.length ? Math.min(...bars.map(p => Math.min(p.low, p.open, p.close))) : 0;
  const high = bars.length ? Math.max(...bars.map(p => Math.max(p.high, p.open, p.close))) : 0;
  const pad = (high - low || high * .01 || 1) * .08;
  const bottom = 262, top = 20, left = width < 480 ? 62 : 76, right = width - 16;
  const step = (right - left) / Math.max(1, bars.length), candleWidth = Math.min(13, Math.max(.6, step * .65));
  const x = (i: number) => left + step * (i + .5);
  const y = (price: number) => bottom - (price - (low - pad)) / (high - low + 2 * pad) * (bottom - top);
  const maxVolume = Math.max(1, ...bars.filter(b => b.volumeAvailable).map(b => b.volume));
  const change = first && last ? (last.close / first.close - 1) * 100 : null;
  const pointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width * width;
    setHovered(Math.min(bars.length - 1, Math.max(0, Math.floor((px - left) / step))));
  };
  return <section className="mk-panel mk-index-charts" aria-label="Public PSX index charts">
    <div className="mk-section-heading"><div><h2>PSX index candlestick charts</h2><p>Genuine PSX open, high, low and close data for KSE-100 and KMI-30.</p></div><span className="mk-tag">No login needed</span></div>
    <div className="mk-index-controls">
      <div className="mk-segments" aria-label="Choose an index">{INDICES.map(id => <button key={id} aria-pressed={symbol === id} onClick={() => setSymbol(id)}>{label(id)}</button>)}</div>
      <div className="mk-segments" aria-label="Candle interval">{(['1D', '1W', '1M'] as const).map(value => <button key={value} aria-pressed={interval === value} onClick={() => setInterval(value)}>{value === '1D' ? 'Daily' : value === '1W' ? 'Weekly' : 'Monthly'}</button>)}</div>
      <div className="mk-segments" aria-label="Index chart period">{PERIODS.map(([value, title]) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{title}</button>)}</div>
    </div>
    <div ref={box} className="mk-index-plot">
      {bars.length >= 1 && daily.length >= 2 && last && first && current ? <>
        <div className="mk-index-summary"><div><small>{label(symbol)} · latest reported daily close</small><strong>{number(last.close)} <span>points</span></strong><small>As of {date(last.time)}</small></div><div><span className={change! >= 0 ? 'up' : 'down'}>{change! >= 0 ? '+' : ''}{number(change!)}%</span><small>{date(first.time)} – {date(last.time)}</small><small>Closing-level change over the selected range</small></div></div>
        <div className="mk-index-readout"><span>{date(current.time)}{current.endTime && current.endTime !== current.time ? ` – ${date(current.endTime)}` : ''}</span><span>O <strong>{number(current.open)}</strong></span><span>H <strong>{number(current.high)}</strong></span><span>L <strong>{number(current.low)}</strong></span><span>C <strong>{number(current.close)}</strong></span><span>Vol <strong>{volume(current)}</strong></span></div>
        <p className="mk-small mk-index-instructions">Hover, tap or use ← → to inspect candles. Green: close ≥ open. Red: close &lt; open.</p>
        <svg viewBox={`0 0 ${width} 375`} width="100%" height="375" role="img" tabIndex={0}
          aria-label={`${label(symbol)} ${interval} candlestick chart. Open, high, low, close and volume. Use left and right arrows to inspect candles.`}
          onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setHovered(null)}
          onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); setHovered(i => event.key === 'Home' ? 0 : event.key === 'End' ? bars.length - 1 : Math.min(bars.length - 1, Math.max(0, (i ?? bars.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1)))); }}>
          {[0, 1, 2, 3, 4].map(i => { const value = low - pad + (high - low + 2 * pad) * i / 4; return <g key={i}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--mk-line)"/><text x={left - 10} y={y(value) + 4} textAnchor="end">{Math.round(value).toLocaleString('en')}</text></g>; })}
          {bars.map((bar, i) => { const color = bar.close >= bar.open ? '#059669' : '#dc3855'; return <g key={bar.time} data-candle-date={date(bar.time)}><title>{date(bar.time)}: Open {number(bar.open)}, High {number(bar.high)}, Low {number(bar.low)}, Close {number(bar.close)}, Volume {volume(bar)}</title><line x1={x(i)} x2={x(i)} y1={y(bar.high)} y2={y(bar.low)} stroke={color} strokeWidth={Math.min(1.2, Math.max(.5, step * .35))}/><rect x={x(i) - candleWidth / 2} y={Math.min(y(bar.open), y(bar.close))} width={candleWidth} height={Math.max(1, Math.abs(y(bar.open) - y(bar.close)))} fill={color}/>{bar.volumeAvailable && <rect x={x(i) - candleWidth / 2} y={338 - bar.volume / maxVolume * 46} width={candleWidth} height={bar.volume / maxVolume * 46} fill={color} opacity=".38"/>}</g>; })}
          <line x1={left} x2={right} y1="285" y2="285" stroke="var(--mk-line)"/><text x={left} y="281">Volume</text>
          {hovered != null && <line x1={x(Math.min(hovered, bars.length - 1))} x2={x(Math.min(hovered, bars.length - 1))} y1={top} y2="340" stroke="var(--mk-muted)" strokeDasharray="4 4"/>}
          <text x={left} y="365">{date(bars[0].time)}</text><text x={right} y="365" textAnchor="end">{date(last.time)}</text>
        </svg>
        <div className="mk-index-range-stats"><span>Candles <strong>{bars.length}</strong></span><span>Interval <strong>{interval === '1D' ? 'Daily' : interval === '1W' ? 'Weekly' : 'Monthly'}</strong></span><span>Source <strong>PSX historical report</strong></span></div>
        <p className="mk-small">OHLC values are shown as reported by PSX. Weekly/monthly candles combine available daily sessions; the current period may be incomplete. Available history: {date(history[0].time)} – {date(history.at(-1)!.time)}. Range changes compare daily closes, including the last close at or before the start. Long ranges may show dense candles; choose Weekly or Monthly for a clearer view.</p>
      </> : <div className="mk-empty" role="status"><h3>{loading ? `Loading ${label(symbol)} candles…` : `${label(symbol)} candles are unavailable`}</h3><p>{loading ? 'Fetching official PSX open, high, low and close records.' : 'Please retry or check the official source.'}</p></div>}
    </div>
    <div className="mk-feed"><span role="status">{loading ? 'Checking PSX…' : error ? (bars.length ? 'Could not refresh. Previous candles remain visible.' : 'The history feed is temporarily unavailable.') : 'Daily candles · May be delayed'}</span><a href="https://dps.psx.com.pk/historical" target="_blank" rel="noopener noreferrer">PSX historical data ↗</a><button disabled={loading} onClick={() => setAttempt(n => n + 1)}>Refresh history</button></div>
  </section>;
}
