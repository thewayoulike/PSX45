import React, { useEffect, useState } from 'react';
import { CommodityStats } from './CommodityStats';
import { CommodityChart } from './CommodityChart';
import { loadMarketData, type FxRates } from '../../services/marketOverview';
import { COMMODITY_IDS, COMMODITY_NAMES, commodityNumber, commodityPercentLabel, commodityReturn, type CommodityId, type CommoditySeries } from '../../services/commodityDashboard';

export function CommodityQuotes({ referenceConverter }: { referenceConverter?: React.ReactNode }) {
  const [selected, setSelected] = useState<CommodityId>('gold'), [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');
  const [quotes, setQuotes] = useState<CommoditySeries[]>([]), [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    loadMarketData('commodity-dashboard', attempt > 0).then(result => { if (active) setQuotes(result.data.quotes); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    loadMarketData('fx', attempt > 0).then(result => { if (active) setFx(result.data); }).catch(() => { if (active) setFx(null); });
    return () => { active = false; };
  }, [attempt]);
  const quote = quotes.find(item => item.id === selected), name = COMMODITY_NAMES[selected];
  const pkrRate = fx?.rates.PKR && Number.isFinite(fx.rates.PKR) && fx.rates.PKR > 0 ? fx.rates.PKR : null;
  return <section className="mk-commodity-dashboard" aria-label="Commodity prices and history">
    <div className="mk-section-heading"><div><h2>Commodities right now</h2><p>Gold, silver, copper and WTI. Select a card to explore its price history.</p></div><button disabled={loading} onClick={() => setAttempt(n => n + 1)}>{loading ? 'Refreshing…' : 'Refresh prices'}</button></div>
    <p className="mk-small mk-commodity-status" role="status">{error ? 'Prices could not refresh.' + (quotes.length ? ' Previous figures remain visible.' : ' Please retry.') : loading ? 'Checking the latest available futures quotes…' : 'Futures quotes · May be delayed. Quote times are shown below each price.'}</p>
    <div className="mk-commodity-cards" aria-label="Choose a commodity">{COMMODITY_IDS.map(id => {
      const item = quotes.find(value => value.id === id), change = commodityReturn(item, '1D');
      const delta = item?.price != null && item.previousClose != null ? item.price - item.previousClose : null;
      return <button key={id} className={'mk-commodity-card mk-native-commodity-card' + (change != null && change < 0 ? ' is-down' : '') + (selected === id ? ' is-selected' : '')} aria-pressed={selected === id} aria-controls="commodity-history" onClick={() => setSelected(id)}>
        <span className="mk-native-card-name">{COMMODITY_NAMES[id]}<span aria-hidden="true">{change == null ? '—' : change < 0 ? '▾' : '▴'}</span></span>
        <strong className={change == null ? 'neutral' : change < 0 ? 'down' : 'up'}>{item?.price != null ? '$' + commodityNumber(item.price) : '—'}</strong>
        <span className="mk-native-card-change">Change: {delta == null ? '—' : (delta >= 0 ? '+' : '−') + commodityNumber(Math.abs(delta))} ({commodityPercentLabel(change)})</span>
        <span className="mk-native-card-range"><span>High: <b>{commodityNumber(item?.high)}</b></span><span>Low: <b>{commodityNumber(item?.low)}</b></span></span>
        <span className="mk-native-card-time">{item?.asOf ? new Date(item.asOf).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' PKT' + (item.stale ? ' · Could not refresh' : '') : loading ? 'Loading…' : 'Quote unavailable'}</span>
      </button>;
    })}</div>
    <div className="mk-commodity-chart-layout">
      <CommodityStats quote={quote} name={name} currency={currency} onCurrency={setCurrency} pkrRate={pkrRate} fxDate={fx?.date || null}/>
      <CommodityChart quote={quote} name={name} loading={loading}/>
    </div>
    <p className="mk-small mk-commodity-method">Quotes and daily history: Yahoo Finance futures series. 1D uses the quoted contract’s previous close; longer periods compare the last available close on or before the corresponding calendar date. Contract rolls can affect historical changes. These are price changes, not total investment returns. Missing figures appear as —.</p>
    {referenceConverter && <details className="mk-panel mk-commodity-converter"><summary>Gold & silver · daily reference converter <span>USD / PKR · ounce, tola or gram</span></summary>{referenceConverter}</details>}
  </section>;
}
