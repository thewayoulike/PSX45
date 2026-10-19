import React, { useEffect, useState } from 'react';
import { CommodityStats } from './CommodityStats';

const COMMODITIES = [
  { id: 'gold', name: 'Gold', symbol: 'CAPITALCOM:XAUUSD', unit: 'Troy ounce', code: 'XAUUSD' },
  { id: 'silver', name: 'Silver', symbol: 'CAPITALCOM:XAGUSD', unit: 'Troy ounce', code: 'XAGUSD' },
  { id: 'copper', name: 'Copper', symbol: 'CAPITALCOM:XCUUSD', unit: 'Pound', code: 'XCUUSD' },
  { id: 'wti', name: 'Crude Oil (WTI)', symbol: 'CAPITALCOM:USOIL', unit: 'Barrel', code: 'USOIL' },
] as const;

type WidgetKind = 'single-quote' | 'symbol-info' | 'symbol-overview';
function widgetUrl(kind: WidgetKind, settings: Record<string, unknown>, dark: boolean) {
  const symbolQuery = kind === 'symbol-info' ? `&symbol=${encodeURIComponent(String(settings.symbol))}` : '';
  return `https://www.tradingview-widget.com/embed-widget/${kind}/?locale=en${symbolQuery}#${encodeURIComponent(JSON.stringify({
    ...settings, isTransparent: dark ? false : settings.isTransparent, locale: 'en', colorTheme: dark ? 'dark' : 'light',
    utm_source: 'psx-tracker.com', utm_medium: 'widget_new', utm_campaign: kind,
  }))}`;
}
function ProviderFrame({ kind, title, settings, dark, height, attempt }: {
  kind: WidgetKind; title: string; settings: Record<string, unknown>; dark: boolean; height: number; attempt: number;
}) {
  // Keep prices and history within the provider's public widgets; do not scrape or store quotes.
  const src = widgetUrl(kind, settings, dark);
  return <iframe key={`${src}-${attempt}`} title={title} src={src}
    width="100%" height={height} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />;
}

export function CommodityQuotes({ referenceConverter }: { referenceConverter?: React.ReactNode }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<typeof COMMODITIES[number]>(COMMODITIES[0]);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const source = `https://www.tradingview.com/symbols/${selected.symbol.replace(':', '-')}/`;
  return <section className="mk-commodity-dashboard" aria-label="Commodity prices and history">
    <div className="mk-section-heading">
      <div><h2>Commodities right now</h2><p>Gold, silver, copper and WTI. Select a card to explore its price history.</p></div>
      <button onClick={() => setAttempt(n => n + 1)}>Reload quotes</button>
    </div>
    <p className="mk-small mk-commodity-status">Latest available broker quotes · Markets update during trading hours. When closed, the last available quote remains visible.</p>
    <div className="mk-commodity-cards" aria-label="Choose a commodity">
      {COMMODITIES.map(item => <article key={item.id} className={`mk-commodity-card${selected.id === item.id ? ' is-selected' : ''}`}>
        <button className="mk-commodity-select" aria-pressed={selected.id === item.id} aria-controls="commodity-history" onClick={() => setSelected(item)}>
          <span>{item.name}</span><span aria-hidden="true">{selected.id === item.id ? '✓' : '↗'}</span>
        </button>
        <ProviderFrame kind="single-quote" title={`${item.name} latest quote`} dark={dark} height={101} attempt={attempt}
          settings={{ symbol: item.symbol, width: '100%', height: 101, isTransparent: true }} />
        <div className="mk-commodity-unit">USD / {item.unit.toLowerCase()}<span>{selected.id === item.id ? 'Chart selected' : 'Select name for chart'}</span></div>
      </article>)}
    </div>
    <div className="mk-commodity-chart-layout">
      <CommodityStats symbol={selected.symbol} name={selected.name} unit={selected.unit} dark={dark} attempt={attempt} />
      <div id="commodity-history" className="mk-panel mk-commodity-history" aria-label={`${selected.name} price history`}>
        <div className="mk-commodity-chart-heading"><h3>{selected.name} price history</h3><span className="mk-tag">USD / {selected.unit.toLowerCase()}</span></div>
        <ProviderFrame kind="symbol-overview" title={`${selected.name} interactive price chart`} dark={dark} height={460} attempt={attempt}
          settings={{ symbols: [[selected.name, `${selected.symbol}|1D`]], chartOnly: false, width: '100%', height: '100%',
            isTransparent: true, showVolume: false, showMA: false, hideDateRanges: false, hideMarketStatus: false,
            hideSymbolLogo: true, scalePosition: 'right', scaleMode: 'Normal', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11',
            chartType: 'area', lineWidth: 2, lineColor: '#059669', topColor: 'rgba(16,185,129,0.32)', bottomColor: 'rgba(16,185,129,0.02)',
            dateRanges: ['1w|60', '1m|60', '3m|1D', '6m|1D', '12m|1D', '36m|1W', '60m|1W', 'all|1M'] }} />
        <div className="tradingview-widget-copyright"><a href={source} target="_blank" rel="noopener noreferrer nofollow">{selected.name} charts and quotes by TradingView ↗</a></div>
      </div>
    </div>
    <p className="mk-small">These are Capital.com quotes for contracts for difference (CFDs), which can differ from physical spot prices and exchange futures. Availability and delays depend on the provider. If a widget is unavailable, reload quotes or open the source. No sample prices are substituted.</p>
    {referenceConverter && <details className="mk-panel mk-commodity-converter"><summary>Gold & silver · daily reference converter <span>USD / PKR · ounce, tola or gram</span></summary>{referenceConverter}</details>}
  </section>;
}
