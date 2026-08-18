import React, { useEffect, useRef, useState } from 'react';
import { CandlestickChart, ExternalLink } from 'lucide-react';

interface Props { symbol: string | null; }

// TradingView carries proper OHLC (open/high/low/close) for PSX symbols under the
// "PSX:" exchange prefix — e.g. PSX:ENGRO, PSX:OGDC, PSX:786. That's the same feed
// other PSX portfolio trackers (UpInvest, etc.) use to render real candlesticks.
// PSX's own EOD endpoint only returns close + volume, so we embed TradingView here.

const isDark = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

export const StockChart: React.FC<Props> = ({ symbol }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(isDark() ? 'dark' : 'light');

  // Track app dark-mode toggles so the chart re-themes.
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const t = isDark() ? 'dark' : 'light';
      setTheme(prev => (prev === t ? prev : t));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    const tvSymbol = `PSX:${symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

    // Reset and (re)inject the widget whenever symbol or theme changes.
    container.innerHTML = '';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    container.appendChild(widget);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: 'D',
      timezone: 'Asia/Karachi',
      theme,
      style: '1',                 // 1 = candlesticks
      locale: 'en',
      withdateranges: true,       // 1D / 1M / 6M / 1Y / 5Y range buttons
      range: 'YTD',
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      backgroundColor: theme === 'dark' ? 'rgba(15,23,42,1)' : 'rgba(255,255,255,1)',
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => { container.innerHTML = ''; };
  }, [symbol, theme]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
          <CandlestickChart size={18} />
        </div>
        <div>
          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight">{symbol} · Candlestick Chart</h3>
          <div className="text-xs text-slate-400">Open · High · Low · Close — switch timeframe or chart type in the toolbar</div>
        </div>
      </div>

      <div className="p-3">
        <div
          key={symbol || 'none'}
          className="tradingview-widget-container w-full h-[420px] sm:h-[560px] rounded-2xl overflow-hidden"
          ref={containerRef}
        />
        <p className="text-[10px] text-slate-400 mt-2 px-1 flex items-center gap-1">
          <ExternalLink size={9} /> Live OHLC candles via TradingView (PSX:{(symbol || '').toUpperCase()}). If a chart doesn't load, that symbol isn't yet listed on TradingView.
        </p>
      </div>
    </div>
  );
};
