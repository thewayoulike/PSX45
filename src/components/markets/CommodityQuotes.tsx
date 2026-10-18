import React, { useEffect, useMemo, useState } from 'react';

const SOURCE = 'https://www.tradingview.com/markets/';

export function CommodityQuotes() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [attempt, setAttempt] = useState(0);
  const [showChart, setShowChart] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const src = useMemo(() => {
    // Use the provider's public embed. Prices stay inside its frame; no stored copies.
    const settings = {
      colorTheme: dark ? 'dark' : 'light', dateRange: '1D', locale: 'en',
      isTransparent: false, showChart, showFloatingTooltip: true,
      width: '100%', height: showChart ? 540 : 330,
      tabs: [{ title: 'Energy & copper', symbols: [
        { s: 'CAPITALCOM:UKOIL', d: 'Brent crude · USD / barrel' },
        { s: 'CAPITALCOM:USOIL', d: 'WTI crude · USD / barrel' },
        { s: 'CAPITALCOM:NATURALGAS', d: 'Natural gas · USD / MMBtu' },
        { s: 'CAPITALCOM:XCUUSD', d: 'Copper · USD / pound' },
      ] }],
      utm_source: 'psx-tracker.com', utm_medium: 'widget_new', utm_campaign: 'market-overview',
    };
    return 'https://www.tradingview-widget.com/embed-widget/market-overview/?locale=en#' + encodeURIComponent(JSON.stringify(settings));
  }, [dark, showChart]);
  return <section className="mk-panel mk-commodity-quotes" aria-label="Latest energy and copper quotes">
    <div className="mk-section-heading">
      <div><h3>Latest energy & copper quotes</h3><p>Broker CFD reference prices · Capital.com via TradingView</p></div>
      <div className="mk-toolbar"><button aria-pressed={showChart} onClick={() => setShowChart(value => !value)}>{showChart ? 'Hide chart' : 'Show price chart'}</button><button onClick={() => setAttempt(n => n + 1)}>Reload quotes</button></div>
    </div>
    <p className="mk-small">Quotes update from the provider during trading hours. When a market is closed, its latest available price remains visible. Check the market-status icon beside each symbol for any delay. Open a symbol for source details and timing.</p>
    <iframe key={`${dark}-${attempt}`} title="Latest energy and copper quotes from TradingView" src={src}
      width="100%" height={showChart ? 540 : 330} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
    <div className="tradingview-widget-copyright"><a href={SOURCE} target="_blank" rel="noopener noreferrer nofollow">Commodity markets by TradingView ↗</a></div>
    <p className="mk-small">These are broker quotes for contracts for difference (CFDs); they may differ from physical spot prices and exchange futures. Copper is quoted per pound. All four use USD and are independent of the gold/silver conversion controls. If quotes are blocked or unavailable, reload or open the source above.</p>
  </section>;
}
