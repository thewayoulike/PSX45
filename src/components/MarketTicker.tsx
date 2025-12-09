import React, { useEffect, useState } from 'react';
import { fetchTopVolumeStocks } from '../services/psxData';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

export const MarketTicker: React.FC = () => {
  const [stocks, setStocks] = useState<{ symbol: string; price: number; change: number; volume: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchTopVolumeStocks();
        console.log("Market Ticker Data:", data); // Check Console for this!
        if (data && data.length > 0) {
          setStocks(data);
        } else {
          setError(true);
        }
      } catch (e) {
        console.error("Ticker fetch failed", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  if (loading) return null; 
  if (stocks.length === 0) return null;

  // Duplicate list multiple times to ensure smooth infinite scroll even on wide screens
  const tickerItems = [...stocks, ...stocks, ...stocks, ...stocks];

  return (
    <div className="w-full bg-slate-900 text-white border-b border-slate-800 shadow-sm relative z-50 h-10 flex items-center overflow-hidden">
      {/* Static Badge */}
      <div className="bg-emerald-600 h-full px-4 flex items-center justify-center font-bold text-[10px] md:text-xs uppercase tracking-wider shadow-lg z-20 shrink-0 relative">
        Top Active
        {/* Right Arrow/Triangle for visual separation */}
        <div className="absolute -right-2 top-0 h-full w-0 border-t-[20px] border-t-transparent border-l-[10px] border-l-emerald-600 border-b-[20px] border-b-transparent"></div>
      </div>

      {/* Scrolling Content Container */}
      <div className="flex-1 overflow-hidden relative h-full flex items-center group">
        <div className="animate-ticker flex items-center whitespace-nowrap pl-4">
          {tickerItems.map((s, i) => (
            <div key={`${s.symbol}-${i}`} className="flex items-center gap-2 text-xs mr-8">
              <span className="font-bold text-emerald-400">{s.symbol}</span>
              <span className="font-mono text-slate-100">{s.price.toFixed(2)}</span>
              
              <div className={`flex items-center gap-0.5 font-bold ${s.change > 0 ? 'text-emerald-500' : s.change < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                {s.change > 0 ? <TrendingUp size={12} /> : s.change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                <span>{Math.abs(s.change).toFixed(2)}</span>
              </div>
              
              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                Vol: {(s.volume / 1000000).toFixed(2)}M
              </span>
              
              <span className="text-slate-700 opacity-30 mx-2">|</span>
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          display: flex;
          animation: ticker 60s linear infinite;
        }
        .group:hover .animate-ticker {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};
