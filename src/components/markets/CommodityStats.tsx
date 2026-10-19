import React from 'react';
import { commodityNumber, commodityReturn, commodityPercentLabel, type CommoditySeries } from '../../services/commodityDashboard';

export function CommodityStats({ quote, name, currency, onCurrency, pkrRate, fxDate }: {
  quote?: CommoditySeries; name: string; currency: 'USD' | 'PKR'; onCurrency: (value: 'USD' | 'PKR') => void;
  pkrRate: number | null; fxDate: string | null;
}) {
  const amount = (value?: number | null) => commodityNumber(value == null || (currency === 'PKR' && pkrRate == null) ? null : value * (currency === 'PKR' ? pkrRate! : 1));
  return <aside className="mk-panel mk-commodity-key-stats" aria-label={name + ' key stats'}>
    <div className="mk-commodity-key-heading"><h3>Key stats <span>{name}</span></h3>
      <div className="mk-stat-currencies" role="group" aria-label="Key stats currency">{(['USD', 'PKR'] as const).map(value =>
        <button key={value} aria-pressed={currency === value} onClick={() => onCurrency(value)}>{value}</button>)}</div>
    </div>
    <dl className="mk-commodity-stat-list">
      <div><dt>Price</dt><dd>{amount(quote?.price)}</dd></div>
      {(['1D', '1W', '1M', '3M', '1Y', '3Y', '5Y'] as const).map(period => {
        const change = commodityReturn(quote, period);
        return <div key={period}><dt>{period}</dt><dd className={change == null || Math.abs(change) < .005 ? 'neutral' : change > 0 ? 'up' : 'down'}>{commodityPercentLabel(change)}</dd></div>;
      })}
      <div><dt>Day High</dt><dd>{amount(quote?.high)}</dd></div>
      <div><dt>Day Low</dt><dd>{amount(quote?.low)}</dd></div>
      <div><dt>Prev Close</dt><dd>{amount(quote?.previousClose)}</dd></div>
      <div><dt>Unit</dt><dd>{currency} / {quote?.unit || (name === 'Copper' ? 'lb' : name.includes('WTI') ? 'barrel' : 'troy oz')}</dd></div>
    </dl>
    {currency === 'PKR' && <p className="mk-small mk-stat-currency-note">{pkrRate ? 'PKR amounts use the reference FX rate' + (fxDate ? ' (' + new Date(fxDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' }) + ')' : '') + '. Percent changes and the chart remain in USD.' : 'The PKR reference rate is unavailable. Percent changes remain in USD.'}</p>}
    <p className="mk-small mk-stat-source">{quote?.contract || 'Futures quote'} · {quote?.sourceUrl ? <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">Yahoo Finance ↗</a> : 'Waiting for data'}</p>
  </aside>;
}
