import React, { useState } from 'react';
import { Transaction, FoundDividend } from '../types'; 
import { fetchDividends } from '../services/gemini';
import { Coins, Loader2, Calendar, Search, X, History, Sparkles, Building2, Clock, RefreshCw, AlertCircle } from 'lucide-react';

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
          const announcements = await fetchDividends(tickers, months);
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-16 md:pt-24">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Coins className="text-indigo-600 dark:text-indigo-400" size={24} />
                    Dividend Scanner
                </h2>
                <div className="flex items-center gap-2">
                    {/* NEW: Force Rescan Button */}
                    <button onClick={handleScan} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all" title="Force Rescan">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                    {dismissedItems.length > 0 && (
                        <button onClick={() => setShowDismissed(!showDismissed)} className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${showDismissed ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title="Show Dismissed">
                            <History size={16} /> {dismissedItems.length}
                        </button>
                    )}
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={24} /></button>
                </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative bg-white dark:bg-slate-900">
                {/* 1. INITIAL STATE */}
                {!scanned && foundDividends.length === 0 && !loading && !errorMsg && (
                    <div className="text-center py-10">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400"> <Sparkles size={40} /> </div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Find Unclaimed Income</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto"> Scanning your transaction history for missing dividends. </p>
                        <div className="flex justify-center mb-8">
                            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors select-none">
                                <input type="checkbox" checked={useDeepScan} onChange={(e) => setUseDeepScan(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"> <Clock size={16} className={useDeepScan ? "text-indigo-500" : "text-slate-400"} /> Deep Scan (1 Year) </span>
                            </label>
                        </div>
                        <button onClick={handleScan} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 mx-auto"> <Search size={18} /> Scan Portfolio </button>
                    </div>
                )}

                {/* 2. LOADING STATE */}
                {loading && ( <div className="flex flex-col items-center justify-center py-20 animate-in fade-in"> <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" /> <h4 className="text-slate-700 dark:text-slate-300 font-bold mb-1">Scanning Market Data...</h4> </div> )}

                {/* 3. ERROR MESSAGE */}
                {errorMsg && ( <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4"> <AlertCircle size={20} /> <span className="text-sm font-medium">{errorMsg}</span> </div> )}

                {/* 4. RESULTS OR EMPTY RESULTS */}
                {(scanned || foundDividends.length > 0) && !loading && (
                    <div className="space-y-6">
                        {foundDividends.length === 0 && !showDismissed ? (
                            // NEW: Empty State Message
                            <div className="text-center py-12 opacity-60">
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <CheckCircle size={32} />
                                </div>
                                <h3 className="text-slate-600 dark:text-slate-300 font-bold">You are all caught up!</h3>
                                <p className="text-slate-400 text-sm mt-1">No missing dividends found in your history.</p>
                                <button onClick={handleScan} className="mt-4 text-indigo-600 dark:text-indigo-400 text-sm font-bold hover:underline">Scan Again?</button>
                            </div>
                        ) : (
                            // Results List
                            <>
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <h3 className="text-slate-800 dark:text-slate-100 font-bold text-lg"> {showDismissed ? `Dismissed History` : `Found ${foundDividends.length} Eligible`} </h3>
                                </div>
                                <div className="space-y-4">
                                    {(showDismissed ? dismissedItems : foundDividends).map((div, idx) => (
                                        <div key={idx} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${showDismissed ? 'opacity-75 grayscale-[0.5]' : ''}`}>
                                            <div className="flex items-start gap-4">
                                                <div className="bg-indigo-50 dark:bg-indigo-900/30 h-12 w-16 rounded-lg flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm shadow-sm border border-indigo-100 dark:border-indigo-800"> {div.ticker} </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1"> <span className="text-slate-800 dark:text-slate-200 font-bold text-base">{div.type} Dividend</span> <span className="text-[10px] text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"> <Building2 size={10} /> {div.broker} </span> </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400"> 
                                                        <span>DPS: <span className="font-medium text-slate-700 dark:text-slate-300">Rs. {div.amount}</span></span> 
                                                        <span>Qty: {div.eligibleQty}</span> 
                                                        <span className="flex items-center gap-1"> <Calendar size={10} /> {new Date(div.exDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {!showDismissed && (
                                                <div className="mt-4 flex justify-end gap-2">
                                                    <button onClick={() => handleAdd(div)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all">Add Income</button>
                                                    <button onClick={() => handleIgnore(div)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 text-xs font-bold px-4 py-2 rounded-lg transition-colors">Dismiss</button>
                                                </div>
                                            )}
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
