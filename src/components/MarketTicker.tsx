import React, { useEffect, useState } from 'react';
import { fetchTopVolumeStocks } from '../services/psxData';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

export const MarketTicker: React.FC = () => {
  const [stocks, setStocks] = useState<{ symbol: string; price: number; change: number; volume: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchTopVolumeStocks();
        if (data && data.length > 0) {
          setStocks(data);
        }
      } catch (e) {
        console.error("Ticker fetch failed", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  if (loading || stocks.length === 0) return null;

  const tickerItems = [...stocks, ...stocks, ...stocks];

  return (
    <div className="w-full bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/60 shadow-sm relative z-50 h-10 flex items-center overflow-hidden">
      
      {/* Premium Badge Area */}
      <div className="bg-emerald-600 dark:bg-emerald-600 h-full px-5 flex items-center justify-center gap-2 shadow-md z-20 shrink-0 relative">
        <Activity size={14} className="text-white drop-shadow-sm" />
        <span className="font-display font-black text-[10px] md:text-xs uppercase tracking-widest text-white drop-shadow-sm">
          Top Active
        </span>
        {/* The slanted edge element */}
        <div className="absolute -right-2 top-0 h-full w-4 bg-emerald-600 dark:bg-emerald-600 transform skew-x-12 border-r border-emerald-500/30"></div>
      </div>

      <div className="flex-1 overflow-hidden relative h-full flex items-center group mask-gradient">
        <div className="animate-ticker flex items-center whitespace-nowrap pl-6">
          {tickerItems.map((s, i) => (
            <div key={`${s.symbol}-${i}`} className="flex items-center gap-3 text-xs mr-8">
              
              {/* Ticker Symbol */}
              <span className="font-display font-black text-slate-900 dark:text-white tracking-tight">
                {s.symbol}
              </span>
              
              {/* Price */}
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                {s.price.toFixed(2)}
              </span>
              
              {/* Change Indicator */}
              <div className={`flex items-center gap-1 font-mono font-bold tabular-nums ${s.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : s.change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {s.change > 0 ? <TrendingUp size={12} strokeWidth={3} /> : s.change < 0 ? <TrendingDown size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
                <span>{Math.abs(s.change).toFixed(2)}</span>
              </div>
              
              {/* Volume */}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest tabular-nums border-l border-slate-200 dark:border-slate-700 pl-3 ml-1">
                Vol: {(s.volume / 1000000).toFixed(2)}M
              </span>
              
              {/* Separator Dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mx-3"></div>
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-ticker { display: flex; animation: ticker 80s linear infinite; }
        .group:hover .animate-ticker { animation-play-state: paused; }
        .mask-gradient { mask-image: linear-gradient(to right, transparent, black 20px, black 95%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black 95%, transparent); }
      `}</style>
    </div>
  );
};
