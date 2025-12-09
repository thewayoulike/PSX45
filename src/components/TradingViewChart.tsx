import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number;
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({ 
  symbol, 
  theme = 'light', 
  height = 600 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Clear previous content
    containerRef.current.innerHTML = '';

    // 2. Create the script
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Ensure PSX prefix
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    // 4. Configure Widget
    script.innerHTML = JSON.stringify({
      "symbols": [
        [
          tvSymbol,         // Label shown on chart
          tvSymbol + "|1D"  // Data source (forced to Daily)
        ]
      ],
      "chartOnly": false,
      "width": "100%",
      "height": height,
      "locale": "en",
      "colorTheme": theme,
      "autosize": false,
      "showVolume": true,
      "hideDateRanges": false,
      "scalePosition": "right",
      "scaleMode": "Normal",
      "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      "fontSize": "10",
      "noTimeScale": false,
      "valuesTracking": "1",
      "changeMode": "price-and-percent",
      "chartType": "candlesticks", // Nice candles instead of line
      "maLineColor": "#2962FF",
      "maLineWidth": 1,
      "maLength": 9,
      "gridLineColor": "rgba(240, 243, 250, 0)",
      "backgroundColor": "rgba(255, 255, 255, 1)",
      "widgetFontColor": "rgba(19, 23, 34, 1)",
      "upColor": "#22ab94",
      "downColor": "#f7525f",
      "borderUpColor": "#22ab94",
      "borderDownColor": "#f7525f",
      "wickUpColor": "#22ab94",
      "wickDownColor": "#f7525f"
    });

    containerRef.current.appendChild(script);
  }, [symbol, theme, height]);

  return (
    <div 
      // KEY PROP is critical - it forces React to destroy and recreate 
      // the div when the symbol changes, preventing glitches.
      key={symbol} 
      className="tradingview-widget-container w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white" 
      ref={containerRef}
      style={{ height: `${height}px`, width: '100%' }}
    >
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
};

export default memo(TradingViewChart);
