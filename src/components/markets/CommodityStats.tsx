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

export function CommodityStats({ symbols, dark, attempt }: { symbols: string[]; dark: boolean; attempt: number }) {
  const [view, setView] = useState<'performance' | 'overview'>('performance');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    loadMarketDataWidget().then(() => { if (active) setState('ready'); }, () => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt, retry]);
  return <section className="mk-panel mk-commodity-key-stats" aria-label="Commodity key stats">
    <div className="mk-section-heading">
      <div><h3>Key stats</h3><p>Compare all four commodities at a glance.</p></div>
      <div className="mk-segments" role="group" aria-label="Key stats view">
        <button aria-pressed={view === 'performance'} onClick={() => setView('performance')}>Performance</button>
        <button aria-pressed={view === 'overview'} onClick={() => setView('overview')}>Price details</button>
      </div>
    </div>
    <p className="mk-small">{view === 'performance'
      ? 'Daily, 1-week, 1-month, 6-month and 1-year price changes. For 3-month, 3-year or 5-year changes, select that range on the chart below.'
      : 'Latest price, daily change, open, day high, day low and previous close.'}</p>
    {state === 'error' ? <div className="mk-commodity-stats-error" role="status">
      <p>The statistics provider could not connect. You can still use the quote cards and chart.</p>
      <button onClick={() => setRetry(n => n + 1)}>Retry statistics</button>
    </div> : <div className="mk-commodity-data-scroll" tabIndex={0} role="region" aria-label={`${view === 'performance' ? 'Performance' : 'Price details'} table, scroll horizontally to see all columns`}>
      <div className={`mk-commodity-data-widget mk-commodity-data-${view}`}>
        {state === 'loading' ? <p role="status">Loading commodity statistics…</p> : React.createElement(ELEMENT, {
          key: `${attempt}-${retry}`, 'symbol-sectors': JSON.stringify([{ sectionName: 'Commodities · USD', symbols }]),
          view, theme: dark ? 'dark' : 'light', transparent: '',
        })}
      </div>
    </div>}
    <p className="mk-small mk-commodity-table-note">USD prices: gold and silver per troy ounce · copper per pound · WTI per barrel. Scroll the table sideways on smaller screens.</p>
    <div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/markets/commodities/" target="_blank" rel="noopener noreferrer nofollow">Market data by TradingView ↗</a></div>
  </section>;
}
