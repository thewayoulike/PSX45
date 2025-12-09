import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  className?: string; // Added className prop for better sizing control
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({ 
  symbol, 
  theme = 'light', 
  className = "h-[600px]" // Default tall height
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Clean up previous script
    containerRef.current.innerHTML = '';

    // 2. Create script
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Configure Widget
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    script.innerHTML = JSON.stringify({
      "autosize": true, // This makes it fill the parent container
      "symbol": tvSymbol,
      "interval": "D",
      "timezone": "Asia/Karachi",
      "theme": theme,
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": false,
      "calendar": false,
      "hide_side_toolbar": false,
      "support_host": "https://www.tradingview.com"
    });

    // 4. Append
    containerRef.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div 
      className={`tradingview-widget-container w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white ${className}`} 
      ref={containerRef}
    >
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }}></div>
    </div>
  );
};

export default memo(TradingViewChart);
