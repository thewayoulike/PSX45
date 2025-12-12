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
    <div className="w-full bg-emerald-50/90 dark:bg-emerald-950/90 backdrop-blur-md border-b border-emerald-100 dark:border-emerald-900 shadow-sm relative z-50 h-10 flex items-center overflow-hidden font-sans">
      <div className="bg-emerald-600 h-full px-4 flex items-center justify-center gap-2 shadow-lg z-20 shrink-0 relative">
        <Activity size={14} className="text-white" />
        <span className="font-black text-[10px] md:text-xs uppercase tracking-widest text-white">
          Top Active
        </span>
        <div className="absolute -right-2 top-0 h-full w-4 bg-emerald-600 transform skew-x-12"></div>
      </div>

      <div className="flex-1 overflow-hidden relative h-full flex items-center group mask-gradient">
        <div className="animate-ticker flex items-center whitespace-nowrap pl-6">
          {tickerItems.map((s, i) => (
            <div key={`${s.symbol}-${i}`} className="flex items-center gap-3 text-xs mr-8">
              <span className="font-black text-slate-800 dark:text-slate-100">{s.symbol}</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {s.price.toFixed(2)}
              </span>
              <div className={`flex items-center gap-0.5 font-bold ${s.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : s.change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {s.change > 0 ? <TrendingUp size={12} /> : s.change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                <span>{Math.abs(s.change).toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-orange-700 dark:text-orange-400 font-bold font-mono">
                Vol: {(s.volume / 1000000).toFixed(2)}M
              </span>
              <div className="w-1 h-1 rounded-full bg-emerald-200 dark:bg-emerald-800 mx-2"></div>
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
