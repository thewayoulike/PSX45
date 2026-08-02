import React, { useState } from 'react';
import { Transaction, FoundDividend, DividendAnnouncement } from '../types';
import { fetchDividends } from '../services/gemini';
import { fetchDividendsForScan } from '../services/financials';
import { Coins, Loader2, CheckCircle, Calendar, Search, X, History, Sparkles, Building2, Clock, RefreshCw, AlertCircle } from 'lucide-react';

interface DividendScannerProps {
  transactions: Transaction[];
  onAddTransaction: (t: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  savedResults: FoundDividend[];
  onSaveResults: (results: FoundDividend[]) => void;
}

export const DividendScanner: React.FC<DividendScannerProps> = ({ 
  transactions, onAddTransaction, isOpen, onClose, onOpenSettings, savedResults, onSaveResults
}) => {
  const [loading, setLoading] = useState(false);
  const [foundDividends, setFoundDividends] = useState<FoundDividend[]>(savedResults);
  const [dismissedItems, setDismissedItems] = useState<FoundDividend[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [scanned, setScanned] = useState(savedResults.length > 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useDeepScan, setUseDeepScan] = useState(false);
  const [scanSource, setScanSource] = useState<'sheet' | 'ai' | null>(null);

  const updateDividends = (newDividends: FoundDividend[]) => { setFoundDividends(newDividends); onSaveResults(newDividends); };

  const getHoldingsBreakdownOnDate = (ticker: string, targetDate: string) => {
      const breakdown: Record<string, number> = {};
      const relevantTx = transactions.filter(t => t.ticker === ticker && t.date < targetDate && (t.type === 'BUY' || t.type === 'SELL'));
      relevantTx.forEach(t => { const brokerName = t.broker || 'Unknown Broker'; if (!breakdown[brokerName]) breakdown[brokerName] = 0; if (t.type === 'BUY') breakdown[brokerName] += t.quantity; if (t.type === 'SELL') breakdown[brokerName] -= t.quantity; });
      Object.keys(breakdown).forEach(key => { if (breakdown[key] <= 0) delete breakdown[key]; });
      return breakdown;
  };

  const handleScan = async () => {
      setLoading(true); setErrorMsg(null); setShowDismissed(false);
      const tickers = Array.from(new Set(transactions.map(t => t.ticker))) as string[];
      if (tickers.length === 0) { setLoading(false); setScanned(true); return; }
      try {
          const months = useDeepScan ? 12 : 6;

          // PRIMARY: your X-Dates Google Sheet (deterministic, correct face value).
          // FALLBACK: Gemini AI search — used ONLY if the sheet fails (not signed in / API error).
          let announcements: DividendAnnouncement[];
          try {
              announcements = await fetchDividendsForScan(months);
              setScanSource('sheet');
          } catch (sheetErr) {
              announcements = await fetchDividends(tickers, months);
              setScanSource('ai');
          }

          const newEligible: FoundDividend[] = [];
          announcements.forEach(ann => {
              const brokerMap = getHoldingsBreakdownOnDate(ann.ticker, ann.exDate);
              Object.entries(brokerMap).forEach(([brokerName, qty]) => {
                  const alreadyRecorded = transactions.some(t => t.type === 'DIVIDEND' && t.ticker === ann.ticker && t.date === ann.exDate && (t.broker || 'Unknown Broker') === brokerName);
                  if (!alreadyRecorded) { newEligible.push({ ...ann, eligibleQty: qty, broker: brokerName }); }
              });
          });
          updateDividends(newEligible); 
          setScanned(true);
      } catch (e: any) { setErrorMsg(e.message || "Failed to scan."); } finally { setLoading(false); }
  };

  const handleAdd = (div: FoundDividend) => {
      const totalAmount = div.eligibleQty * div.amount; const wht = totalAmount * 0.15;
      onAddTransaction({ ticker: div.ticker, type: 'DIVIDEND', quantity: div.eligibleQty, price: div.amount, date: div.exDate, tax: wht, commission: 0, cdcCharges: 0, broker: div.broker, notes: `${div.type} Dividend (${div.period || 'N/A'})` });
      const remaining = foundDividends.filter(d => d !== div); updateDividends(remaining);
  };
  const handleIgnore = (div: FoundDividend) => { setDismissedItems(prev => [div, ...prev]); const remaining = foundDividends.filter(d => d !== div); updateDividends(remaining); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-start justify-center p-4 pt-16 md:pt-24 transition-opacity">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
                <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                        <Coins size={20} />
                    </div>
                    Dividend Scanner
                </h2>
                <div className="flex items-center gap-3">
                    {/* Force Rescan Button */}
                    <button onClick={handleScan} disabled={loading} className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/20" title="Force Rescan">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                    {dismissedItems.length > 0 && (
                        <button onClick={() => setShowDismissed(!showDismissed)} className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${showDismissed ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 shadow-inner' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title="Show Dismissed">
                            <History size={16} /> <span className="tabular-nums">{dismissedItems.length}</span>
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"><X size={20} /></button>
                </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative bg-white dark:bg-slate-900">
                
                {/* 1. INITIAL STATE */}
                {!scanned && foundDividends.length === 0 && !loading && !errorMsg && (
                    <div className="text-center py-10 animate-fade-in-up">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm"> 
                            <Sparkles size={36} /> 
                        </div>
                        <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white mb-2 tracking-tight">Find Unclaimed Income</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium mb-8 max-w-sm mx-auto"> 
                            Automatically scan your transaction history for missing corporate action dividends. 
                        </p>
                        
                        <div className="flex justify-center mb-8">
                            <label className="flex items-center gap-3 cursor-pointer bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 px-5 py-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 transition-colors select-none shadow-sm group">
                                <input type="checkbox" checked={useDeepScan} onChange={(e) => setUseDeepScan(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-2 focus:ring-offset-0 cursor-pointer" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 group-hover:text-slate-900 dark:group-hover:text-white transition-colors"> 
                                    <Clock size={16} className={useDeepScan ? "text-indigo-500" : "text-slate-400 group-hover:text-indigo-400"} /> 
                                    Deep Scan (Last 12 Months) 
                                </span>
                            </label>
                        </div>
                        
                        <button onClick={handleScan} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 mx-auto hover:-translate-y-0.5 active:translate-y-0"> 
                            <Search size={18} /> Scan Portfolio Now
                        </button>
                    </div>
                )}

                {/* 2. LOADING STATE */}
                {loading && ( 
                    <div className="flex flex-col items-center justify-center py-24 animate-in fade-in zoom-in-95 duration-300"> 
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-800 mb-6 shadow-sm">
                            <Loader2 size={32} className="animate-spin text-indigo-600 dark:text-indigo-400" /> 
                        </div>
                        <h4 className="text-slate-800 dark:text-slate-200 font-display font-bold text-lg tracking-tight mb-2">Scanning Market Data...</h4> 
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Cross-referencing execution dates</p>
                    </div> 
                )}

                {/* 3. ERROR MESSAGE */}
                {errorMsg && ( 
                    <div className="bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 p-4 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-6 shadow-sm animate-in fade-in"> 
                        <AlertCircle size={20} /> 
                        <span className="text-sm font-medium">{errorMsg}</span> 
                    </div> 
                )}

                {/* 4. RESULTS OR EMPTY RESULTS */}
                {(scanned || foundDividends.length > 0) && !loading && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {foundDividends.length === 0 && !showDismissed ? (
                            // Empty State Message
                            <div className="text-center py-16 opacity-80">
                                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                                    <CheckCircle size={36} />
                                </div>
                                <h3 className="text-slate-800 dark:text-slate-100 font-display font-black text-2xl tracking-tight mb-2">You are all caught up!</h3>
                                <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">No missing dividends found in your historical data.</p>
                                <button onClick={handleScan} className="text-indigo-600 dark:text-indigo-400 text-sm font-bold hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1.5 mx-auto">
                                    <RefreshCw size={14} /> Scan Again
                                </button>
                            </div>
                        ) : (
                            // Results List
                            <>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
                                    <h3 className="text-slate-900 dark:text-white font-display font-black text-lg tracking-tight flex items-center gap-2">
                                        {showDismissed ? <><History size={18} className="text-slate-400" /> Dismissed History</> : <><Sparkles size={18} className="text-indigo-500" /> Found {foundDividends.length} Eligible</>}
                                    </h3>
                                    {!showDismissed && scanSource && (
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border shadow-sm ${scanSource === 'sheet' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20'}`}>
                                            {scanSource === 'sheet' ? 'via X-Dates Sheet' : 'via AI Search'}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="space-y-4">
                                    {(showDismissed ? dismissedItems : foundDividends).map((div, idx) => (
                                        <div key={idx} className={`bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all relative overflow-hidden group ${showDismissed ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                
                                                <div className="flex items-start sm:items-center gap-4">
                                                    <div className="bg-indigo-50 dark:bg-indigo-500/10 h-12 w-16 rounded-xl flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-display font-black tracking-tight text-sm shadow-sm border border-indigo-100 dark:border-indigo-500/20 shrink-0"> 
                                                        {div.ticker} 
                                                    </div>
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2 mb-1.5"> 
                                                            <span className="text-slate-900 dark:text-white font-bold text-base">{div.type} Dividend</span> 
                                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest flex items-center gap-1 shadow-sm"> 
                                                                <Building2 size={10} /> {div.broker} 
                                                            </span> 
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest"> 
                                                            <span className="flex items-center gap-1.5"><span className="opacity-70">DPS:</span> <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">Rs. {div.amount}</span></span> 
                                                            <span className="flex items-center gap-1.5"><span className="opacity-70">Qty:</span> <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">{div.eligibleQty.toLocaleString()}</span></span> 
                                                            <span className="flex items-center gap-1.5"> <Calendar size={12} className="opacity-70" /> {new Date(div.exDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {!showDismissed && (
                                                    <div className="flex items-center gap-2 sm:shrink-0 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60">
                                                        <button onClick={() => handleIgnore(div)} className="flex-1 sm:flex-none bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm">Dismiss</button>
                                                        <button onClick={() => handleAdd(div)} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 hover:-translate-y-0.5 active:translate-y-0">Add Income</button>
                                                    </div>
                                                )}
                                                
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
