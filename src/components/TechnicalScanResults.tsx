import React, { useRef, useState } from 'react';
import { Download, ExternalLink, Lock } from 'lucide-react';
import { SCAN_DISCLAIMER, technicalExplanation, technicalPlanExplanation, type TechnicalAnalysis } from '../utils/technicalRatings';
import './technical-scan.css';

export interface TechnicalResult { symbol: string; current: number; changePct: number; volume: number; technical: TechnicalAnalysis }
const fmt = (v: number | null | undefined, d = 2) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const tone = (s: string) => s.includes('BUY') ? 'buy' : s.includes('SELL') ? 'sell' : s === 'Incomplete' || s === 'Unavailable' ? 'unavailable' : 'neutral';

function RatingGauge({ score }: { score: number | null }) {
  const angle = Math.PI + ((score ?? 0) + 1) / 2 * Math.PI;
  return <svg viewBox="0 0 250 155" role="img" aria-label={score == null ? 'Rating unavailable' : `Overall score ${score.toFixed(3)}`} className="technical-gauge">
    {['#ed3f65', '#f78491', '#ebcf85', '#79cead', '#009879'].map((color, i) => {
      const a = Math.PI + i * Math.PI / 5, b = a + Math.PI / 5;
      return <path key={color} d={`M ${125 + 100 * Math.cos(a)} ${115 + 100 * Math.sin(a)} A 100 100 0 0 1 ${125 + 100 * Math.cos(b)} ${115 + 100 * Math.sin(b)}`} fill="none" stroke={score == null ? '#cbd5e1' : color} strokeWidth="15" />;
    })}
    {score != null && <><line x1="125" y1="115" x2={125 + 83 * Math.cos(angle)} y2={115 + 83 * Math.sin(angle)} stroke="currentColor" strokeWidth="3" /><circle cx="125" cy="115" r="6" fill="white" stroke="currentColor" strokeWidth="2" /></>}
    <text x="13" y="140">Strong Sell</text><text x="125" y="140" textAnchor="middle">Neutral</text><text x="237" y="140" textAnchor="end">Strong Buy</text>
  </svg>;
}

export function TechnicalScanResults({ results, view, visibleLimit = Infinity, onUpgrade, onChart, onSnapshot }: {
  results: TechnicalResult[]; view: 'cards' | 'table'; visibleLimit?: number; onUpgrade: () => void; onChart?: (symbol: string) => void; onSnapshot: (symbol: string) => void;
}) {
  const [selected, setSelected] = useState(''), [tab, setTab] = useState('all'), [filter, setFilter] = useState('all');
  const detail = useRef<HTMLElement>(null);
  const visible = results.slice(0, visibleLimit);
  const result = visible.find(r => r.symbol === selected) || visible[0];
  const choose = (symbol: string) => { setSelected(symbol); setFilter('all'); detail.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  if (!result) return <button onClick={onUpgrade} className="flex items-center gap-2 p-4 rounded-xl border border-emerald-200 text-emerald-700"><Lock size={16} /> Upgrade to view scan results</button>;
  const a = result.technical, plan = a.plan;
  const rows = a.rows.filter(r => (tab === 'all' || r.group === tab) && (filter === 'all' || (r.signal || 'Unavailable') === filter));
  return <div className={`technical-scan ${view === 'table' ? 'technical-table-layout' : ''}`}>
    <aside className="technical-list" aria-label="Scan results">
      <div className="technical-list-heading"><strong>{results.length} results</strong><span>Select a stock</span></div>
      <div className="technical-list-scroll">
        {view === 'table' ? <table className="technical-results-table"><thead><tr><th>Stock</th><th>Daily close</th><th>Coverage</th><th>Rating</th></tr></thead><tbody>
          {results.map((r, i) => <tr key={r.symbol}>{i >= visibleLimit ? <td colSpan={4}><button onClick={onUpgrade}><Lock size={14} /> Upgrade to view result</button></td> : <><td><button aria-pressed={r.symbol === result.symbol} onClick={() => choose(r.symbol)}>{r.symbol}</button></td><td>{fmt(r.technical.summary.lastPrice)}</td><td>{r.technical.available}/26</td><td><span className={`technical-pill ${tone(r.technical.rating)}`}>{r.technical.rating}</span></td></>}</tr>)}
        </tbody></table> : results.map((r, i) => i >= visibleLimit ? <button key={r.symbol} onClick={onUpgrade} className="technical-result"><Lock size={16} /> Upgrade to view result</button> : <button className={`technical-result ${r.symbol === result.symbol ? 'selected' : ''}`} key={r.symbol} aria-pressed={r.symbol === result.symbol} onClick={() => choose(r.symbol)}>
          <span className="technical-result-top"><strong>{r.symbol}</strong><b>Rs. {fmt(r.technical.summary.lastPrice)}</b></span>
          <span className="technical-result-bottom"><span className={`technical-pill ${tone(r.technical.rating)}`}>{r.technical.rating}</span><span>{r.technical.available}/26 signals</span></span>
          <span className="technical-result-groups">Averages: {r.technical.groups[0].rating} · Oscillators: {r.technical.groups[1].rating}</span>
        </button>)}
      </div>
    </aside>
    <section ref={detail} className="technical-detail" aria-label={`${result.symbol} technical snapshot`}>
      <header className="technical-detail-header">
        <div><p className="technical-eyebrow">Technical snapshot</p><h3>{result.symbol}</h3><p>1D · {a.candleDate || 'No daily data'} · {a.bars} daily candles</p></div>
        <div className="technical-price"><strong>Rs. {fmt(a.summary.lastPrice)}</strong><span>Daily candle close</span><button onClick={() => onSnapshot(result.symbol)}><Download size={15} /> Snapshot</button></div>
      </header>
      <div className="technical-quote">Latest fetched quote: <b>Rs. {fmt(result.current)}</b> · {fmt(result.changePct)}% · Volume {fmt(result.volume, 0)}. Quote and candle dates may differ.</div>
      <div className="technical-body">
        <div className="technical-rating"><div><p className="technical-eyebrow">Overall rating · {a.available}/26 available</p><h4 className={tone(a.rating)}>{a.rating}</h4><p>{a.score == null ? 'Overall rating withheld until all signals are available.' : 'Equal weight to moving averages and oscillators.'}</p><div className="technical-votes"><span className="sell"><b>{a.summary.sells}</b> Sell</span><span className="neutral"><b>{a.summary.neutrals}</b> Neutral</span><span className="buy"><b>{a.summary.buys}</b> Buy</span></div></div><RatingGauge score={a.score} /></div>
        <div className="technical-group-cards">{a.groups.map(g => <button key={g.key} onClick={() => { setTab(g.key); setFilter('all'); }}><span>{g.label}<small>{g.available}/{g.total} ↗</small></span><strong className={tone(g.rating)}>{g.rating}</strong><small>{g.sells} Sell · {g.neutrals} Neutral · {g.buys} Buy</small></button>)}</div>
        <div className="technical-tabs" role="group" aria-label="Indicator group">{[['all', 'All 26'], ['averages', 'Moving averages 15'], ['oscillators', 'Oscillators 11']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
        <div className="technical-filter"><span>{rows.length} readings · tap a name for its rule</span><select aria-label="Filter signals" value={filter} onChange={e => setFilter(e.target.value)}>{[['all', 'All signals'], ['BUY', 'Buy'], ['NEUTRAL', 'Neutral'], ['SELL', 'Sell'], ['Unavailable', 'Unavailable']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <table className="technical-indicators"><thead><tr><th>Indicator</th><th>Value</th><th>Signal</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td><details><summary>{row.name}</summary><p>{row.rule}{row.signal == null && ' This signal needs more valid history or source data; it is excluded from the counts.'}</p></details></td><td>{fmt(row.value)}</td><td><span className={`technical-pill ${tone(row.signal || 'Unavailable')}`}>{row.signal || 'Unavailable'}</span></td></tr>)}</tbody></table>
        {!rows.length && <p className="technical-empty">No readings match this filter.</p>}
        <section className="technical-levels"><h4>Price levels & trade plan</h4><p>Illustrative long-position scenario · PKR · reference close {fmt(a.summary.lastPrice)}</p>{plan ? <div className="technical-level-grid">
          <div><span>Entry range</span><strong>{fmt(plan.entryLow)} – {fmt(plan.entryHigh)}</strong></div><div><span>Stop level</span><strong className="sell">{fmt(plan.stop)}</strong><small>Risk {fmt(plan.riskPct)}%</small></div>
          {plan.targets.map((target, i) => <div className="technical-target" key={i}><span>Take profit {i + 1}</span><strong className="buy">{fmt(target)}</strong><small>{i + 1}R · +{fmt(plan.rewardPct[i])}%</small></div>)}
          <div><span>Support · 20-session low</span><strong>{fmt(plan.support)}</strong></div><div><span>Resistance · 20-session high</span><strong>{fmt(plan.resistance)}</strong></div><div><span>ATR (14) · true range</span><strong>{fmt(plan.atr)}</strong></div>
        </div> : <p>Levels unavailable: at least 20 valid daily candles and positive volatility are needed.</p>}</section>
        <details className="technical-method" open><summary>How the rating works</summary>{technicalExplanation(a).map(p => <p key={p}>{p}</p>)}</details>
        <details className="technical-method"><summary>How price levels and take profits work</summary>{technicalPlanExplanation.map(p => <p key={p}>{p}</p>)}</details>
        <p className="technical-disclaimer">{SCAN_DISCLAIMER}</p>
        {onChart && <button className="technical-chart-link" onClick={() => onChart(result.symbol)}>Open {result.symbol} chart <ExternalLink size={14} /></button>}
      </div>
    </section>
  </div>;
}
