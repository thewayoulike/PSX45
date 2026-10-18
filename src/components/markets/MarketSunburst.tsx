import React, { useId, useState } from 'react';
import { marketBreadth, stockWeight, type MarketStock } from '../../services/marketOverview';
export type MapBasis = 'float' | 'cap' | 'equal';
const number = (n: number | null, digits = 2) => n == null ? '—' : n.toLocaleString('en-PK', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const marketChange = (n: number | null) => n == null ? 'Unavailable' : `${n > 0 ? '+' : ''}${number(n)}%`;
export const marketTone = (n: number | null) => n == null || n === 0 ? 'neutral' : n > 0 ? 'up' : 'down';
const color = (n: number | null) => n == null || n === 0 ? '#80939a' : n > 0 ? n > 1.5 ? '#087b51' : n > .6 ? '#10a16d' : '#72c5a5' : n < -1.5 ? '#b52337' : n < -.6 ? '#ce4a59' : '#edabb2';
const pt = (r: number, a: number) => [300 + r * Math.cos(a), 300 + r * Math.sin(a)];
function ring(inner: number, outer: number, start: number, end: number) {
  end = Math.min(end, start + Math.PI * 2 - .00001);
  return `M${pt(outer, start)} A${outer},${outer} 0 ${end - start > Math.PI ? 1 : 0} 1 ${pt(outer, end)} L${pt(inner, end)} A${inner},${inner} 0 ${end - start > Math.PI ? 1 : 0} 0 ${pt(inner, start)} Z`;
}
function labelPath(start: number, end: number) {
  const lower = Math.sin((start + end) / 2) > 0;
  const a = pt(140, start + .035), b = pt(140, end - .035);
  return `M${lower ? b : a} A140,140 0 ${end - start > Math.PI ? 1 : 0} ${lower ? 0 : 1} ${lower ? a : b}`;
}
export function MarketSunburst({ rows, universe, onOpen }: { rows: MarketStock[]; universe: string; onOpen: (s: MarketStock) => void }) {
  const [basis, setBasis] = useState<MapBasis>('float');
  const [selected, setSelected] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const uid = useId().replace(/:/g, '');
  const eligible = rows.filter(r => stockWeight(r, basis) > 0);
  const groups = [...new Set(eligible.map(r => r.sector))].map(sector => ({ sector, rows: eligible.filter(r => r.sector === sector) })).sort((a, b) => b.rows.reduce((v, r) => v + stockWeight(r, basis), 0) - a.rows.reduce((v, r) => v + stockWeight(r, basis), 0));
  const total = eligible.reduce((v, r) => v + stockWeight(r, basis), 0);
  const chosen = eligible.find(r => r.symbol === (hover || selected)) || eligible[0];
  const breadth = marketBreadth(rows);
  let angle = -Math.PI / 2;
  const shapes: React.ReactNode[] = [], labels: React.ReactNode[] = [];
  groups.forEach((g, i) => {
    const weight = g.rows.reduce((s, r) => s + stockWeight(r, basis), 0), size = weight / total * Math.PI * 2;
    const rated = g.rows.filter(r => r.change != null), ratedWeight = rated.reduce((s, r) => s + stockWeight(r, basis), 0);
    const average = ratedWeight ? rated.reduce((s, r) => s + r.change! * stockWeight(r, basis), 0) / ratedWeight : null;
    const start = angle, id = `${uid}-sector-${i}`;
    shapes.push(<path key={id} d={ring(95, 181, start, start + size)} fill={color(average)} stroke="white" strokeWidth="1.1"><title>{g.sector}: {number(weight / total * 100)}% of map</title></path>);
    if (size * 140 > 90) labels.push(<g key={id}><defs><path id={id} d={labelPath(start, start + size)} /></defs><text fill={average != null && Math.abs(average) > .6 ? 'white' : '#122f25'} fontSize="11" fontWeight="750"><textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{g.sector.length > 24 ? g.sector.replace('Companies', '').replace('Generation & Distribution', '').trim() : g.sector}</textPath></text></g>);
    let a = start;
    g.rows.sort((x, y) => stockWeight(y, basis) - stockWeight(x, basis)).forEach(r => {
      const sweep = stockWeight(r, basis) / total * Math.PI * 2, mid = a + sweep / 2, xy = pt(230, mid);
      shapes.push(<path key={r.symbol} d={ring(182, 283, a, a + sweep)} fill={color(r.change)} className={chosen?.symbol === r.symbol ? 'is-chosen' : ''} stroke="white" strokeWidth="1" role="button" tabIndex={0} aria-label={`${r.symbol}: ${marketChange(r.change)}, ${number(stockWeight(r, basis) / total * 100)}% of map`} aria-pressed={selected === r.symbol} onMouseEnter={() => setHover(r.symbol)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.symbol)} onBlur={() => setHover(null)} onClick={() => { setSelected(r.symbol); setHover(null); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.symbol); setHover(null); } }}><title>{r.symbol} · {marketChange(r.change)} · Rs {number(r.price)}</title></path>);
      if (sweep * 230 > 23) labels.push(<text key={r.symbol} transform={`translate(${xy}) rotate(${mid * 180 / Math.PI + (Math.cos(mid) < 0 ? 180 : 0)})`} textAnchor="middle" dominantBaseline="central" fill={r.change != null && Math.abs(r.change) > .6 ? 'white' : '#122f25'} fontWeight="750" fontSize={sweep * 230 > 40 ? 14 : 10}>{r.symbol}</text>);
      a += sweep;
    });
    angle += size;
  });
  return <div className="mk-map"><div className="mk-section-heading"><div><h3>{universe} sector heatmap</h3><p>Inner ring: sectors · Outer ring: companies</p></div><label>Size by<select value={basis} onChange={e => setBasis(e.target.value as MapBasis)} aria-label="Heatmap size basis"><option value="float">Free-float value</option><option value="cap">Market cap</option><option value="equal">Equal weight</option></select></label></div>
    {!eligible.length ? <div className="mk-empty"><h3>Sizing data is unavailable</h3><p>Use equal weight to see the available price changes.</p><button onClick={() => setBasis('equal')}>Use equal weight</button></div> : <div className="mk-map-grid"><div><svg viewBox="0 0 600 600" aria-label={`${universe} circular sector and stock heatmap`} role="group">{shapes}<g pointerEvents="none">{labels}<circle cx="300" cy="300" r="94" fill="#e8f6ef" /><text x="300" y="288" textAnchor="middle" fontSize="23" fontWeight="800" fill="#11573d">{universe}</text><text x="300" y="312" textAnchor="middle" fontSize="12" fill="#527667">{eligible.length} companies</text><text x="300" y="332" textAnchor="middle" fontSize="10" fill="#527667">Hover or tap to explore</text></g></svg><div className="mk-legend"><span>Declining</span>{[-2, -1, -.2, 0, .2, 1, 2].map(x => <i key={x} style={{ background: color(x) }} />)}<span>Advancing</span></div></div><aside className="mk-map-side" aria-live="polite">{chosen && <><span className="mk-tag">{chosen.sector}</span><h3>{chosen.symbol}</h3><p>{chosen.name}</p><strong className="mk-big">Rs. {number(chosen.price)}</strong><span className={marketTone(chosen.change)}>{marketChange(chosen.change)}</span><dl><div><dt>Share of visible map</dt><dd>{number(stockWeight(chosen, basis) / total * 100)}%</dd></div><div><dt>Market cap</dt><dd>{chosen.marketCap == null ? '—' : `Rs ${number(chosen.marketCap / 1e9)}B`}</dd></div><div><dt>Volume</dt><dd>{number(chosen.volume, 0)}</dd></div></dl><button onClick={() => onOpen(chosen)}>Open {chosen.symbol} details →</button></>}<p className="mk-small">Sector colour is the weighted average of available changes. Map shares are calculated from the displayed companies, not official index weights.</p></aside></div>}
    <div className="mk-breadth"><strong className="up">▲ {breadth.up} advancing</strong><span>{breadth.flat} unchanged · {breadth.unknown} unavailable</span><strong className="down">{breadth.down} declining ▼</strong></div><div className="mk-breadth-bar">{[['#059669', breadth.up], ['#94a3b8', breadth.flat + breadth.unknown], ['#e04760', breadth.down]].map(([c, n]) => <span key={String(c)} style={{ background: String(c), width: `${rows.length ? Number(n) / rows.length * 100 : 0}%` }} />)}</div><p className="mk-small">{eligible.length} of {rows.length} filtered companies shown. {rows.length - eligible.length > 0 ? 'Companies without sizing data are excluded; switch to equal weight to include them.' : 'Source: PSX market watch and screener.'}</p>
  </div>;
}
