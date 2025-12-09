import React, { useState, useEffect } from 'react';
import { CompanyPayout, Holding } from '../types';
import { fetchMarketWideDividends } from '../services/financials';
import { X, Calendar, Search, Loader2, Filter, RefreshCw, AlertCircle, TrendingUp, Layers, CalendarClock } from 'lucide-react';

interface UpcomingEventsScannerProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: Holding[]; // Passed to verify if you own the stock
}

export const UpcomingEventsScanner: React.FC<UpcomingEventsScannerProps> = ({ 
  isOpen, onClose, holdings 
}) => {
  const [payouts, setPayouts] = useState<CompanyPayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'MY_HOLDINGS'>('ALL');
  const [hasFetched, setHasFetched] = useState(false);

  // Auto-fetch on first open
  useEffect(() => {
    if (isOpen && !hasFetched) {
      handleScan();
    }
  }, [isOpen]);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketWideDividends();
      setPayouts(data);
      setHasFetched(true);
    } catch (e) {
      setError("Failed to fetch market data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const filteredPayouts = payouts.filter(p => {
    if (filterMode === 'MY_HOLDINGS') {
      return holdings.some(h => h.ticker === p.ticker);
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-blue-600" size={24} />
            <div>
              <h2 className="text-lg font-bold text-slate-800">Future X-Dates</h2>
              <p className="text-xs text-slate-500">Upcoming Book Closures (Market Wide)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-4 bg-white">
           <div className="flex items-center gap-2">
              <button 
                onClick={() => setFilterMode('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterMode === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                All Market
              </button>
              <button 
                onClick={() => setFilterMode('MY_HOLDINGS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterMode === 'MY_HOLDINGS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                <Layers size={14} /> My Holdings
              </button>
           </div>

           <button 
             onClick={handleScan} 
             disabled={loading}
             className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
           >
             <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
             Refresh
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-slate-50">
          
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
              <p className="text-sm font-bold text-slate-500">Scanning SCSTrade Data...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-3">
                <AlertCircle size={24} />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Scan Failed</h3>
              <p className="text-xs text-slate-500 max-w-xs">{error}</p>
              <button onClick={handleScan} className="mt-4 text-xs font-bold text-rose-600 hover:underline">Try Again</button>
            </div>
          )}

          {!loading && !error && filteredPayouts.length === 0 && hasFetched && (
             <div className="flex flex-col items-center justify-center py-20 text-center">
                <Search size={40} className="text-slate-300 mb-3" />
                <p className="text-slate-500 font-bold">No upcoming dates found.</p>
                <p className="text-xs text-slate-400 mt-1">
                  {filterMode === 'MY_HOLDINGS' ? "None of your held stocks have announced upcoming dates." : "No market-wide announcements found right now."}
                </p>
             </div>
          )}

          {!loading && !error && filteredPayouts.length > 0 && (
            <div className="divide-y divide-slate-100">
              {filteredPayouts.map((item, idx) => {
                const isOwned = holdings.some(h => h.ticker === item.ticker);
                const holding = holdings.find(h => h.ticker === item.ticker);
                
                // Format details for display (strip extra spaces)
                const rawDate = item.bookClosure.replace('Ex-Date:', '').trim();
                
                return (
                  <div key={`${item.ticker}-${idx}`} className="bg-white p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-sm shrink-0 ${isOwned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {item.ticker}
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-800 text-sm">{item.ticker}</h3>
                          {isOwned && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                              <TrendingUp size={10} /> Owned: {holding?.quantity}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 font-medium bg-slate-100 px-2 py-1 rounded inline-block">
                          {item.details || "Book Closure"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 pl-16 sm:pl-0">
                        <div className="text-right">
                           <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Ex-Date</div>
                           <div className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 whitespace-nowrap">
                             {rawDate}
                           </div>
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
            <p className="text-[10px] text-slate-400">Data Source: SCSTrade (Market Statistics)</p>
        </div>
      </div>
    </div>
  );
};
