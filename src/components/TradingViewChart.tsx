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

    // 2. Create script
    const script = document.createElement('script');
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    // 3. Configure Widget
    // IMPORTANT: We use explicit width/height strings instead of autosize
    // to guarantee the chart is tall enough in the modal.
    const tvSymbol = symbol.toUpperCase().startsWith('PSX:') 
      ? symbol.toUpperCase() 
      : `PSX:${symbol.toUpperCase()}`;

    script.innerHTML = JSON.stringify({
      "width": "100%",
      "height": height.toString(), // Explicitly set height here
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
