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

    // 1. Clean up previous script
    containerRef.current.innerHTML = '';

    // 2. Create script for "Symbol Overview" (This widget allows PSX data)
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Configure Widget
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    script.innerHTML = JSON.stringify({
      "symbols": [
        [
          tvSymbol,
          tvSymbol + "|1D"
        ]
      ],
      "chartOnly": false,
      "width": "100%",
      "height": height.toString(),
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
      "chartType": "candlesticks", // Keeps the professional candle look
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

    // 4. Append
    containerRef.current.appendChild(script);
  }, [symbol, theme, height]);

  return (
    <div 
      className="tradingview-widget-container w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white" 
      ref={containerRef}
      style={{ height: `${height}px` }}
    >
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }}></div>
    </div>
  );
};

export default memo(TradingViewChart);
