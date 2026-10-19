import React, { useEffect, useState } from 'react';

const ELEMENT = 'tv-market-data';
const MODULE_URL = 'https://widgets.tradingview-widget.com/w/en/tv-market-data.js';
let moduleLoad: Promise<void> | null = null;

function loadMarketDataWidget() {
  if (customElements.get(ELEMENT)) return Promise.resolve();
  if (moduleLoad) return moduleLoad;
  moduleLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODULE_URL;
    const timer = window.setTimeout(() => finish(new Error('Statistics took too long to load.')), 20000);
    function finish(error?: Error) {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    }
    script.onload = () => customElements.get(ELEMENT) ? finish() : finish(new Error('Statistics are unavailable.'));
    script.onerror = () => finish(new Error('Statistics could not connect.'));
    document.head.appendChild(script);
  }).catch(error => { moduleLoad = null; throw error; });
  return moduleLoad;
}

export function CommodityStats({ symbol, name, unit, dark, attempt }: { symbol: string; name: string; unit: string; dark: boolean; attempt: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    loadMarketDataWidget().then(() => { if (active) setState('ready'); }, () => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt, retry]);
  return <aside className="mk-panel mk-commodity-key-stats" aria-label={`${name} key stats`}>
    <div className="mk-commodity-key-heading"><h3>Key stats <span>{name}</span></h3><span className="mk-tag">USD</span></div>
    {state === 'error' ? <div className="mk-commodity-stats-error" role="status">
      <p>The statistics provider could not connect. You can still use the quote cards and chart.</p>
      <button onClick={() => setRetry(n => n + 1)}>Retry statistics</button>
    </div> : <div className="mk-commodity-stat-groups">{(['performance', 'overview'] as const).map(view => <section key={view}>
      <h4>{view === 'performance' ? 'Performance' : 'Price details'}</h4>
      <div className="mk-commodity-data-scroll" tabIndex={0} role="region" aria-label={`${name} ${view === 'performance' ? 'performance' : 'price details'}, scroll horizontally to see all values`}>
        <div className={`mk-commodity-data-widget mk-commodity-data-${view}`}>
          {state === 'loading' ? <p role="status">Loading statistics…</p> : React.createElement(ELEMENT, {
            key: `${symbol}-${attempt}-${retry}`, 'symbol-sectors': JSON.stringify([{ sectionName: name, symbols: [symbol] }]),
            view, theme: dark ? 'dark' : 'light', transparent: '',
          })}
        </div>
      </div>
      <p className="mk-small mk-commodity-scroll-hint">{view === 'performance' ? 'Scroll → Today · 1W · 1M · 6M · 1Y' : 'Scroll → Change · Open · High · Low · Prev close'}</p>
    </section>)}</div>}
    <dl className="mk-commodity-stat-unit"><dt>Unit</dt><dd>USD / {unit.toLowerCase()}</dd></dl>
    <p className="mk-small mk-commodity-table-note">Select 3M, 3Y or 5Y on the chart for longer-period changes.</p>
    <div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/markets/commodities/" target="_blank" rel="noopener noreferrer nofollow">Market data by TradingView ↗</a></div>
  </aside>;
}
