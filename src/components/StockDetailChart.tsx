import React, { useEffect, useRef, memo } from 'react';

interface StockDetailChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number;
}

const StockDetailChart: React.FC<StockDetailChartProps> = ({ 
  symbol, 
  theme = 'light', 
  height = 600 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Wipe clean
    containerRef.current.innerHTML = '';

    // 2. Create the "Symbol Overview" script (The permissive widget)
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Format Symbol
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    console.log("Loading StockDetailChart for:", tvSymbol); // Check your console for this!

    // 4. Configure
    script.innerHTML = JSON.stringify({
      "symbols": [
        [
          tvSymbol,
          tvSymbol + "|1D"
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
      "chartType": "candlesticks",
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
      key={symbol} // Forces React to re-mount on symbol change
      className="tradingview-widget-container w-full rounded-2xl overflow-hidden shadow-sm bg-white" 
      // TEMPORARY RED BORDER TO VERIFY UPDATE
      style={{ height: `${height}px`, border: '2px solid red' }} 
      ref={containerRef}
    >
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
};

export default memo(StockDetailChart);
