import React, { useState, useEffect } from 'react';
import { CompanyPayout, Holding } from '../types';
import { fetchMarketWideDividends } from '../services/financials';
import { X, CalendarClock, Loader2, RefreshCw, Layers } from 'lucide-react';

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
    try { 
      const data = await fetchMarketWideDividends(); 
      setPayouts(data); 
      setHasFetched(true); 
    } 
    catch (e) { setError("Failed to fetch data."); } 
    finally { setLoading(false); }
  };

  const filteredPayouts = payouts.filter(p => filterMode === 'MY_HOLDINGS' ? holdings.some(h => h.ticker === p.ticker) : true);

  if (!isOpen) return null;

  return (
    // MODAL CONTAINER: Top Aligned with glassmorphism
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[80] flex items-start justify-center p-4 pt-16 md:pt-20 overflow-y-auto transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-3xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Premium Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm shrink-0">
                <CalendarClock size={24} />
            </div>
            <div> 
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">Future X-Dates</h2> 
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">Upcoming Book Closures</p> 
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-4 bg-white dark:bg-slate-900 shrink-0">
           <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
              <button 
                onClick={() => setFilterMode('ALL')} 
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterMode === 'ALL' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                All Market
              </button>
              <button 
                onClick={() => setFilterMode('MY_HOLDINGS')} 
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterMode === 'MY_HOLDINGS' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-200/60 dark:border-emerald-500/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              > 
                <Layers size={14} /> My Holdings 
              </button>
           </div>
           <button 
              onClick={handleScan} 
              disabled={loading} 
              className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all shadow-sm hover:-translate-y-0.5"
            > 
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh 
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-900/30">
          {loading && ( 
            <div className="flex flex-col items-center justify-center py-24"> 
                <Loader2 size={40} className="animate-spin text-blue-500 mb-4" /> 
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wide">Scanning Data...</p> 
            </div> 
          )}
          
          {!loading && !error && filteredPayouts.length === 0 && (
             <div className="text-center py-20 text-slate-400 font-medium text-sm">
                No upcoming events found.
             </div>
          )}

          {!loading && !error && filteredPayouts.map((item: any, idx) => {
            const isOwned = holdings.some(h => h.ticker === item.ticker);
            
            // Premium HIGHLIGHT FOR TODAY'S DUE DATE
            const todayHighlightClass = item.isDueToday 
              ? "bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-200/80 dark:border-emerald-500/30 shadow-md shadow-emerald-500/5" 
              : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800 shadow-sm";

            return (
              <div key={`${item.ticker}-${idx}`} className={`${todayHighlightClass} p-5 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-4 hover:shadow-md group`}>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-display font-black shrink-0 border shadow-sm transition-transform group-hover:scale-105 ${item.isDueToday ? 'bg-emerald-600 text-white border-emerald-700' : (isOwned ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60')}`}> 
                    {item.ticker.substring(0,4)} 
                  </div>
                  <div> 
                    <div className="flex items-center gap-2 mb-2 mt-0.5"> 
                      <h3 className="font-display font-black text-slate-900 dark:text-white text-lg tracking-tight">{item.ticker}</h3> 
                      {item.isDueToday && <span className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-md font-bold uppercase tracking-widest shadow-sm">Due Today</span>}
                      {isOwned && <span className="text-[9px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest shadow-sm">Owned</span>} 
                    </div> 
                    
                    {/* UPDATED: Dynamic Chips for Cash, Bonus, and Rights */}
                    <div className="flex flex-wrap gap-2 mt-1"> 
                      {item.details && item.details !== '-' && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-medium bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50"> 
                          {item.details.includes('%') || item.details.toLowerCase().includes('cash') || item.details.toLowerCase().includes('div') 
                            ? item.details 
                            : `Cash: ${item.details}`}
                        </div> 
                      )}
                      {item.bonus && item.bonus !== '-' && item.bonus !== '0' && item.bonus !== '0%' && (
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg border border-indigo-200/60 dark:border-indigo-500/20"> 
                          Bonus: {item.bonus.includes('%') ? item.bonus : `${item.bonus}%`}
                        </div> 
                      )}
                      {item.right && item.right !== '-' && item.right !== '0' && item.right !== '0%' && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-200/60 dark:border-amber-500/20"> 
                          Right: {item.right.includes('%') ? item.right : `${item.right}%`}
                        </div> 
                      )}
                    </div> 

                  </div>
                </div>
                <div className="text-left sm:text-right mt-1 sm:mt-0 ml-18 sm:ml-0"> 
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Ex-Date</div> 
                  <div className={`text-sm font-mono font-bold px-3 py-1.5 rounded-xl border whitespace-nowrap shadow-sm inline-block ${item.isDueToday ? 'bg-emerald-600 text-white border-emerald-700' : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-200/60 dark:border-blue-800/60'}`}> 
                    {item.bookClosure.replace('Ex-Date:', '').trim()} 
                  </div> 
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
