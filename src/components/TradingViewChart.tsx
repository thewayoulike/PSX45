import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number | string;
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({ 
  symbol, 
  theme = 'light', 
  height = 400 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Clean up previous script if any (to prevent duplicates)
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    // 2. Create the script element
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Define the widget configuration
    // PSX symbols on TradingView usually need the "PSX:" prefix
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "D",
      "timezone": "Asia/Karachi",
      "theme": theme,
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    // 4. Append script to container
    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme]);

  return (
    <div 
      className="tradingview-widget-container w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200" 
      ref={containerRef} 
      style={{ height }}
    >
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }}></div>
    </div>
  );
};

export default memo(TradingViewChart);
