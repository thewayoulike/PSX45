import React, { useEffect, useRef, useState } from 'react';
import { loadMarketData } from '../../services/marketOverview';
import { FX_CURRENCIES, FX_PERIODS, fxCrossChange, fxCrossRate, fxChangeLabel, type ForexHeatmapData, type FxPeriod } from '../../services/forexHeatmap';

const dateLabel = (value?: string) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Unavailable';
const rateLabel = (value: number | null) => value == null ? '—' : value.toLocaleString('en-US', { maximumSignificantDigits: 7 });
function cellColor(change: number | null, max: number) {
  if (change == null || Math.abs(change) < 0.005) return '#344256';
  const intensity = Math.min(1, Math.abs(change) / Math.max(0.05, max));
  return change > 0 ? `hsl(157 ${40 + intensity * 30}% ${23 + intensity * 6}%)` : `hsl(346 ${35 + intensity * 35}% ${25 + intensity * 7}%)`;
}

export function ForexHeatmap() {
  const [data, setData] = useState<ForexHeatmapData | null>(null);
  const [period, setPeriod] = useState<FxPeriod>('1D');
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [pair, setPair] = useState({ base: 'USD', quote: 'PKR' });
  const [focusPair, setFocusPair] = useState({ base: 'USD', quote: 'PKR' });
  const table = useRef<HTMLTableElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    loadMarketData('fx-heatmap', attempt > 0).then(result => { if (active) setData(result.data); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const previous = data?.comparisons[period];
  const changes = FX_CURRENCIES.flatMap(base => FX_CURRENCIES.map(quote => fxCrossChange(data?.current, previous, base.code, quote.code)));
  const max = Math.max(0.05, ...changes.map(value => Math.abs(value ?? 0)));
  const selectedChange = fxCrossChange(data?.current, previous, pair.base, pair.quote);
  const selectedRate = fxCrossRate(data?.current, pair.base, pair.quote);
  function moveFocus(event: React.KeyboardEvent, row: number, column: number) {
    const direction = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[event.key];
    if (!direction) return;
    event.preventDefault();
    let nextRow = row + direction[0], nextColumn = column + direction[1];
    if (nextRow === nextColumn) { nextRow += direction[0]; nextColumn += direction[1]; }
    if (nextRow < 0 || nextColumn < 0 || nextRow >= FX_CURRENCIES.length || nextColumn >= FX_CURRENCIES.length) return;
    table.current?.querySelector<HTMLButtonElement>(`button[data-base="${FX_CURRENCIES[nextRow].code}"][data-quote="${FX_CURRENCIES[nextColumn].code}"]`)?.focus();
  }
  return <section className="mk-panel mk-forex-heatmap" aria-label="Forex heatmap">
    <div className="mk-section-heading">
      <div><h3>Forex heatmap</h3><p>See which currencies are strengthening or weakening against each other.</p></div>
      <div className="mk-segments" role="group" aria-label="Forex heatmap period">{FX_PERIODS.map(value =>
        <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div>
    </div>
    <div className="mk-feed" role="status"><span>{loading ? 'Checking daily exchange-rate snapshots…' : error ? `Exchange-rate history could not refresh.${data ? ' Previous figures remain visible.' : ''}`
      : `Daily snapshots · ${dateLabel(previous?.date || data?.requestedDates[period])} → ${dateLabel(data?.current.date)}`}</span>
      <button onClick={() => setAttempt(n => n + 1)} disabled={loading}>{error ? 'Retry heatmap' : 'Refresh heatmap'}</button>
    </div>
    {!data ? <div className="mk-empty"><h3>{loading ? 'Loading currency changes' : 'Forex history is unavailable'}</h3><p>{loading ? 'Fetching the current and historical daily rates.' : 'Please retry. Missing rates are not shown as zero.'}</p></div> : <>
      {!previous && <p className="mk-fx-missing" role="status">The snapshot for {dateLabel(data.requestedDates[period])} is unavailable. Choose another period or retry.</p>}
      <div className="mk-fx-heatmap-scroll" role="region" aria-label="Currency comparison matrix, scroll horizontally on smaller screens" tabIndex={0}>
        <table className="mk-fx-heatmap-table" ref={table}>
          <caption className="sr-only">{period} change in each row currency against each column currency. Positive means the row currency strengthened. Use the arrow keys to move between pairs.</caption>
          <thead><tr><th scope="col"><span className="mk-fx-axis">Row / column</span></th>{FX_CURRENCIES.map(currency => <th scope="col" key={currency.code} title={currency.name}>
            <span className="mk-fx-flag" aria-hidden="true">{currency.flag}</span><span>{currency.code}</span></th>)}</tr></thead>
          <tbody>{FX_CURRENCIES.map((base, row) => <tr key={base.code}>
            <th scope="row" title={base.name}><span className="mk-fx-flag" aria-hidden="true">{base.flag}</span>{base.code}</th>
            {FX_CURRENCIES.map((quote, column) => {
              if (base.code === quote.code) return <td key={quote.code} className="mk-fx-diagonal" aria-label={`${base.code}, same currency`}><span aria-hidden="true">—</span></td>;
              const change = fxCrossChange(data.current, previous, base.code, quote.code);
              const label = fxChangeLabel(change);
              const direction = change == null ? 'Comparison unavailable' : Math.abs(change) < 0.005 ? 'Little or no change' : `${base.code} ${change > 0 ? 'strengthened' : 'weakened'} against ${quote.code}`;
              return <td key={quote.code}><button data-base={base.code} data-quote={quote.code}
                tabIndex={focusPair.base === base.code && focusPair.quote === quote.code ? 0 : -1}
                aria-label={`${base.code}/${quote.code}, ${period}: ${label}. ${direction}.`}
                title={`${base.code}/${quote.code} · ${period}: ${label}\n${direction}\n1 ${base.code} = ${rateLabel(fxCrossRate(data.current, base.code, quote.code))} ${quote.code}`}
                className={pair.base === base.code && pair.quote === quote.code ? 'is-selected' : ''}
                style={{ background: cellColor(change, max) }}
                onMouseEnter={() => setPair({ base: base.code, quote: quote.code })}
                onFocus={() => { setPair({ base: base.code, quote: quote.code }); setFocusPair({ base: base.code, quote: quote.code }); }}
                onClick={() => setPair({ base: base.code, quote: quote.code })}
                onKeyDown={event => moveFocus(event, row, column)}>{label}</button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mk-fx-pair-detail" role="status" aria-live="polite">
        <div><strong>{pair.base} / {pair.quote}</strong><span>1 {pair.base} = {rateLabel(selectedRate)} {pair.quote}</span></div>
        <div><strong className={selectedChange == null || Math.abs(selectedChange) < 0.005 ? 'neutral' : selectedChange > 0 ? 'up' : 'down'}>{fxChangeLabel(selectedChange)}</strong>
          <span>{period} · {selectedChange == null ? 'Comparison unavailable' : Math.abs(selectedChange) < 0.005 ? 'Little or no change' : `${pair.base} ${selectedChange > 0 ? 'strengthened' : 'weakened'} against ${pair.quote}`}</span></div>
      </div>
      <div className="mk-fx-heatmap-legend"><span><i className="negative"/>Row currency weaker</span><span><i className="flat"/>Little or no change</span><span><i className="positive"/>Row currency stronger</span></div>
    </>}
    <p className="mk-small">Hover, tap or focus a cell for pair details. Deeper colour means a larger move within the selected period. Comparisons use calendar-day snapshots, including weekends; these are daily reference rates, not live bank or dealer quotes. A dash means unavailable data or the same currency.</p>
    <a className="mk-small" href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noopener noreferrer">Source: Currency API ↗</a>
  </section>;
}
