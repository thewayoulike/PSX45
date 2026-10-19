import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COMMODITY_RANGES, commodityDate, commodityNumber, commodityPercentLabel, commodityReturn, commodityWindow, type CommodityRange, type CommoditySeries } from '../../services/commodityDashboard';

export function CommodityChart({ quote, name, loading }: { quote?: CommoditySeries; name: string; loading: boolean }) {
  const [range, setRange] = useState<CommodityRange>('1Y'), [hovered, setHovered] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const box = useRef<HTMLDivElement>(null), gradient = useId().replace(/:/g, '');
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(230, entries[0].contentRect.width)));
    observer.observe(box.current); return () => observer.disconnect();
  }, []);
  useEffect(() => setHovered(null), [quote, range]);
  const points = useMemo(() => commodityWindow(quote, range), [quote, range]);
  const change = commodityReturn(quote, '1D');
  const low = points.length ? Math.min(...points.map(point => point.close)) : 0;
  const high = points.length ? Math.max(...points.map(point => point.close)) : 1;
  const span = high - low || Math.abs(high) * .02 || 1;
  const yMin = low - span * .08, yMax = high + span * .08;
  const chartHeight = width < 500 ? 320 : 390, top = 22, bottom = chartHeight - 40, left = width < 500 ? 54 : 64, right = width - 16;
  const from = points.length ? Date.parse(points[0].date) : 0, to = points.length ? Date.parse(points.at(-1)!.date) : 1;
  const x = (i: number) => left + (Date.parse(points[i].date) - from) / Math.max(1, to - from) * (right - left);
  const y = (price: number) => bottom - (price - yMin) / (yMax - yMin) * (bottom - top);
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(point.close).toFixed(2)}`).join(' ');
  const activeIndex = Math.min(hovered ?? points.length - 1, points.length - 1), active = points[activeIndex];
  const pointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = ((event.clientX - rect.left) / rect.width * width - left) / (right - left);
    const time = from + Math.max(0, Math.min(1, fraction)) * (to - from);
    let nearest = 0; points.forEach((point, i) => { if (Math.abs(Date.parse(point.date) - time) < Math.abs(Date.parse(points[nearest].date) - time)) nearest = i; });
    setHovered(nearest);
  };
  const dateTicks = [...new Set(Array.from({ length: width < 500 ? 3 : 6 }, (_, i) => Math.round(i * (points.length - 1) / (width < 500 ? 2 : 5))))].filter(i => i >= 0);
  return <section id="commodity-history" className="mk-panel mk-commodity-history mk-native-commodity-chart" aria-label={`${name} price history`}>
    <div className="mk-native-chart-toolbar"><h3>{name} <span className={change == null ? 'neutral' : change >= 0 ? 'up' : 'down'}>{commodityPercentLabel(change)}</span></h3>
      <div className="mk-commodity-ranges" role="group" aria-label="Commodity chart period">{COMMODITY_RANGES.map(value => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value}</button>)}</div>
    </div>
    <div ref={box} className="mk-native-chart-plot">
      {points.length > 1 ? <>
        <div className="mk-native-chart-readout" aria-live="polite"><span>{active && commodityDate(active.date)}</span><strong>{active && commodityNumber(active.close)} <small>USD / {quote?.unit}</small></strong><span>{range === 'All' ? 'Available history' : `${range} change`} <b className={(commodityReturn(quote, range) ?? 0) >= 0 ? 'up' : 'down'}>{commodityPercentLabel(commodityReturn(quote, range))}</b></span></div>
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`} role="img" tabIndex={0}
          aria-label={`${name} daily price chart in USD. Use left and right arrows to inspect prices.`}
          onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setHovered(null)}
          onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); setHovered(i => event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1)))); }}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity=".55"/><stop offset="100%" stopColor="#10b981" stopOpacity=".04"/></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(i => { const value = yMin + (yMax - yMin) * i / 4; return <g key={i}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--mk-line)"/><text x={left - 10} y={y(value) + 4} textAnchor="end">{value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0 })}</text></g>; })}
          <path d={`${path} L${right},${bottom} L${left},${bottom} Z`} fill={`url(#${gradient})`}/><path d={path} fill="none" stroke="#10b9ac" strokeWidth="2" strokeLinejoin="round"/>
          {dateTicks.map(i => <text key={i} x={x(i)} y={chartHeight - 12} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{new Date(`${points[i].date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...(range === '1W' || range === '1M' ? { day: 'numeric' as const, month: 'short' as const } : { month: 'short' as const, year: '2-digit' as const }) })}</text>)}
          {hovered != null && active && <g><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={bottom} stroke="var(--mk-muted)" strokeDasharray="4 4"/><circle cx={x(activeIndex)} cy={y(active.close)} r="4" fill="#059669" stroke="var(--mk-card)" strokeWidth="2"/></g>}
        </svg>
      </> : <div className="mk-native-chart-empty" role="status">{loading ? 'Loading price history…' : 'Price history is unavailable. Please refresh.'}</div>}
    </div>
    <p className="mk-small mk-native-chart-foot">Daily prices · Hover, tap or use ← → to inspect. {range === 'All' ? 'Up to 10 years of available history.' : ''}</p>
  </section>;
}
