import React, { useState, useEffect } from 'react';
import { CompanyPayout, Holding } from '../types';
import { fetchMarketWideDividends } from '../services/financials';
import { X, Calendar, Search, Loader2, Filter, RefreshCw, AlertCircle, TrendingUp, Layers, CalendarClock } from 'lucide-react';

interface UpcomingEventsScannerProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: Holding[]; 
}

export const UpcomingEventsScanner: React.FC<UpcomingEventsScannerProps> = ({ isOpen, onClose, holdings }) => {
  const [payouts, setPayouts] = useState<CompanyPayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'MY_HOLDINGS'>('ALL');
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => { if (isOpen && !hasFetched) handleScan(); }, [isOpen]);

  const handleScan = async () => {
    setLoading(true); setError(null);
    try { const data = await fetchMarketWideDividends(); setPayouts(data); setHasFetched(true); } 
    catch (e) { setError("Failed to fetch data."); } finally { setLoading(false); }
  };

  const filteredPayouts = payouts.filter(p => filterMode === 'MY_HOLDINGS' ? holdings.some(h => h.ticker === p.ticker) : true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col">
        
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-blue-600 dark:text-blue-400" size={24} />
            <div> <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Future X-Dates</h2> <p className="text-xs text-slate-500 dark:text-slate-400">Upcoming Book Closures</p> </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20} /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4 bg-white dark:bg-slate-900">
           <div className="flex items-center gap-2">
              <button onClick={() => setFilterMode('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterMode === 'ALL' ? 'bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-600' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>All Market</button>
              <button onClick={() => setFilterMode('MY_HOLDINGS')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterMode === 'MY_HOLDINGS' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}> <Layers size={14} /> My Holdings </button>
           </div>
           <button onClick={handleScan} disabled={loading} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors"> <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-slate-50 dark:bg-slate-950">
          {loading && ( <div className="flex flex-col items-center justify-center py-20"> <Loader2 size={40} className="animate-spin text-blue-500 mb-3" /> <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Scanning Data...</p> </div> )}
          {!loading && !error && filteredPayouts.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayouts.map((item, idx) => {
                const isOwned = holdings.some(h => h.ticker === item.ticker);
                return (
                  <div key={`${item.ticker}-${idx}`} className="bg-white dark:bg-slate-900 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-sm shrink-0 ${isOwned ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}> {item.ticker} </div>
                      <div> <div className="flex items-center gap-2 mb-1"> <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{item.ticker}</h3> {isOwned && <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">Owned</span>} </div> <div className="text-xs text-slate-600 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block"> {item.details} </div> </div>
                    </div>
                    <div className="text-right"> <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Ex-Date</div> <div className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border border-blue-100 dark:border-blue-800 whitespace-nowrap"> {item.bookClosure.replace('Ex-Date:', '').trim()} </div> </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
