import React, { useEffect, useState } from 'react';
import { fetchTopVolumeStocks } from '../services/psxData';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const MarketTicker: React.FC = () => {
  const [stocks, setStocks] = useState<{ symbol: string; price: number; change: number; volume: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchTopVolumeStocks();
      if (data.length > 0) {
        setStocks(data);
      }
      setLoading(false);
    };

    loadData();
    // Refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  if (loading || stocks.length === 0) return null;

  return (
    <div className="w-full bg-slate-900 text-white overflow-hidden border-b border-slate-800 shadow-sm relative z-50 h-10 flex items-center">
      {/* Static Badge */}
      <div className="bg-emerald-600 h-full px-4 flex items-center justify-center font-bold text-[10px] md:text-xs uppercase tracking-wider shadow-lg z-20 shrink-0">
        Top Active
      </div>

      {/* Scrolling Content */}
      <div className="flex-1 overflow-hidden relative group">
        <div className="animate-ticker flex items-center whitespace-nowrap gap-8 pl-4 absolute top-1/2 -translate-y-1/2">
          {/* Duplicate list for seamless loop */}
          {[...stocks, ...stocks].map((s, i) => (
            <div key={`${s.symbol}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-100">{s.symbol}</span>
              <span className="font-mono text-slate-300">{s.price.toFixed(2)}</span>
              
              <div className={`flex items-center gap-0.5 font-bold ${s.change > 0 ? 'text-emerald-400' : s.change < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {s.change > 0 ? <TrendingUp size={12} /> : s.change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                <span>{Math.abs(s.change).toFixed(2)}</span>
              </div>
              
              <span className="text-[10px] text-slate-500 font-mono">
                {(s.volume / 1000000).toFixed(2)}M
              </span>
              
              <span className="text-slate-700 opacity-30">|</span>
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
          animation: ticker 60s linear infinite;
        }
        .group:hover .animate-ticker {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};
