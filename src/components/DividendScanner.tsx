import React, { useState } from 'react';
import { Transaction, FoundDividend, CompanyPayout } from '../types'; 
import { fetchDividends } from '../services/gemini';
import { fetchCompanyPayouts } from '../services/financials'; 
import { Coins, Loader2, CheckCircle, Calendar, Search, X, History, RefreshCw, Sparkles, Building2, Clock, Undo2, CalendarClock, Info, AlertTriangle } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'MISSED' | 'FUTURE'>('MISSED');
  
  // --- EXISTING STATE (Missed Dividends) ---
  const [loading, setLoading] = useState(false);
  const [foundDividends, setFoundDividends] = useState<FoundDividend[]>(savedResults);
  const [dismissedItems, setDismissedItems] = useState<FoundDividend[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [scanned, setScanned] = useState(savedResults.length > 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useDeepScan, setUseDeepScan] = useState(false);

  // --- NEW STATE (Future Dividends) ---
  const [futurePayouts, setFuturePayouts] = useState<CompanyPayout[]>([]);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [futureScanned, setFutureScanned] = useState(false);

  const updateDividends = (newDividends: FoundDividend[]) => {
      setFoundDividends(newDividends);
      onSaveResults(newDividends);
  };

  const getHoldingsBreakdownOnDate = (ticker: string, targetDate: string) => {
      const breakdown: Record<string, number> = {};
      const relevantTx = transactions.filter(t => 
          t.ticker === ticker && 
          t.date < targetDate && 
          (t.type === 'BUY' || t.type === 'SELL')
      );
      
      relevantTx.forEach(t => {
          const brokerName = t.broker || 'Unknown Broker';
          if (!breakdown[brokerName]) breakdown[brokerName] = 0;
          if (t.type === 'BUY') breakdown[brokerName] += t.quantity;
          if (t.type === 'SELL') breakdown[brokerName] -= t.quantity;
      });
      
      Object.keys(breakdown).forEach(key => {
          if (breakdown[key] <= 0) delete breakdown[key];
      });
      
      return breakdown;
  };

  const handleScanMissed = async () => {
      setLoading(true);
      setErrorMsg(null);
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
                  if (!alreadyRecorded) {
                      newEligible.push({ ...ann, eligibleQty: qty, broker: brokerName });
                  }
              });
          });
          updateDividends(newEligible);
          setScanned(true);
      } catch (e: any) {
          console.error(e);
          let msg = e.message || "Failed to scan.";
          if (msg.includes("503") || msg.includes("overloaded")) msg = "AI Service is busy (503). Try again later.";
          setErrorMsg(msg);
      } finally { setLoading(false); }
  };

  const handleScanFuture = async () => {
      setLoadingFuture(true);
      const tickers = Array.from(new Set(transactions.map(t => t.ticker))) as string[];
      
      const allUpcoming: CompanyPayout[] = [];
      
      // Fetch sequentially to handle potential rate limits or connection issues gracefully
      for (const ticker of tickers) {
          if (['CASH', 'CGT', 'ANNUAL FEE'].includes(ticker)) continue;
          try {
              const payouts = await fetchCompanyPayouts(ticker);
              const upcoming = payouts.filter(p => p.isUpcoming);
              allUpcoming.push(...upcoming);
          } catch (e) {
              console.warn(`Failed to scan future for ${ticker}`, e);
          }
      }
      
      setFuturePayouts(allUpcoming);
      setFutureScanned(true);
      setLoadingFuture(false);
  };

  const handleAddMissed = (div: FoundDividend) => {
      const totalAmount = div.eligibleQty * div.amount;
      const wht = totalAmount * 0.15;
      onAddTransaction({
          ticker: div.ticker, type: 'DIVIDEND', quantity: div.eligibleQty, price: div.amount, date: div.exDate, tax: wht, commission: 0, cdcCharges: 0, broker: div.broker, notes: `${div.type} Dividend (${div.period || 'N/A'})`
      });
      const remaining = foundDividends.filter(d => d !== div);
      updateDividends(remaining);
  };

  const handleIgnoreMissed = (div: FoundDividend) => {
      setDismissedItems(prev => [div, ...prev]);
      const remaining = foundDividends.filter(d => d !== div);
      updateDividends(remaining);
  };

  const handleRestoreMissed = (div: FoundDividend) => {
      setDismissedItems(prev => prev.filter(d => d !== div));
      updateDividends([div, ...foundDividends]);
  };

  if (!isOpen) return null;
  const uniqueTickersCount = new Set(transactions.map(t => t.ticker)).size;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
            
            {/* Header with Tabs */}
            <div className="bg-slate-50/50 border-b border-slate-200">
                <div className="p-6 pb-0 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Coins className="text-indigo-600" size={24} />
                        Dividend Scanner
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mb-4"><X size={24} /></button>
                </div>
                
                <div className="flex px-6 gap-6 mt-4">
                    <button 
                        onClick={() => setActiveTab('MISSED')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'MISSED' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <History size={16} /> Find Missed (Past)
                    </button>
                    <button 
                        onClick={() => setActiveTab('FUTURE')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'FUTURE' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <CalendarClock size={16} /> Scan Upcoming (Future)
                    </button>
                </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative">
                
                {/* --- TAB 1: MISSED PAST DIVIDENDS --- */}
                {activeTab === 'MISSED' && (
                    <>
                        {!scanned && foundDividends.length === 0 && !loading && !errorMsg && (
                            <div className="text-center py-10 animate-in fade-in">
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                                    <Sparkles size={40} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Find Unclaimed Income</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                    Scanning {uniqueTickersCount} unique stock(s) in your history for missed entries.
                                </p>
                                <div className="flex justify-center mb-8">
                                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-3 rounded-xl border border-slate-200 transition-colors select-none">
                                        <input type="checkbox" checked={useDeepScan} onChange={(e) => setUseDeepScan(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                        <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Clock size={16} className={useDeepScan ? "text-indigo-500" : "text-slate-400"} /> Deep Scan (1 Year)</span>
                                    </label>
                                </div>
                                <button onClick={handleScanMissed} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 mx-auto">
                                   <Search size={18} /> Scan History
                                </button>
                            </div>
                        )}

                        {loading && (
                            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
                                <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
                                <h4 className="text-slate-700 font-bold mb-1">Scanning Market Data...</h4>
                                <p className="text-slate-400 text-sm">Searching {useDeepScan ? "last 12 months" : "last 6 months"} of history...</p>
                            </div>
                        )}

                        {errorMsg && !loading && (
                            <div className="text-center py-10 bg-rose-50/50 rounded-xl border border-rose-100">
                                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-500"><AlertTriangle size={24} /></div>
                                <h3 className="font-bold text-slate-800 mb-1">Scanner Error</h3>
                                <p className="text-slate-500 mb-6 text-sm">{errorMsg}</p>
                                <button onClick={handleScanMissed} className="bg-rose-600 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-sm hover:bg-rose-700">Try Again</button>
                            </div>
                        )}

                        {!loading && !errorMsg && scanned && (
                            <>
                                {foundDividends.length === 0 && !showDismissed ? (
                                     <div className="text-center py-16">
                                        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500"><CheckCircle size={32} /></div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">All Caught Up</h3>
                                        <p className="text-slate-400 text-sm mb-6">No new eligible dividends found.</p>
                                        <div className="flex flex-col items-center gap-3">
                                            <button onClick={handleScanMissed} className="text-indigo-600 text-sm font-bold hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"><RefreshCw size={14} /> Force Re-Scan</button>
                                            {dismissedItems.length > 0 && <button onClick={() => setShowDismissed(true)} className="text-slate-500 text-xs hover:text-slate-700 underline">Show Dismissed</button>}
                                        </div>
                                     </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                            <div>
                                                <h3 className="text-slate-800 font-bold text-lg">{showDismissed ? `Dismissed History (${dismissedItems.length})` : `Found ${foundDividends.length} Eligible`}</h3>
                                                <p className="text-xs text-slate-400 mt-0.5">Matched against {uniqueTickersCount} stocks.</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {dismissedItems.length > 0 && !showDismissed && (
                                                    <button onClick={() => setShowDismissed(true)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><History size={16} /></button>
                                                )}
                                                {showDismissed && (
                                                    <button onClick={() => setShowDismissed(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200">Back</button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            {(showDismissed ? dismissedItems : foundDividends).map((div, idx) => {
                                                const estNet = (div.eligibleQty * div.amount) * 0.85; 
                                                return (
                                                    <div key={`${div.ticker}-${div.exDate}-${div.broker}-${idx}`} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                                        <div className="flex items-start gap-4">
                                                            <div className="bg-indigo-50 h-12 w-16 rounded-lg flex items-center justify-center text-indigo-700 font-bold text-sm shadow-sm border border-indigo-100">{div.ticker}</div>
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-slate-800 font-bold text-base">{div.type} Dividend</span>
                                                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Building2 size={10} /> {div.broker}</span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                                                    <span className="flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> Ex: <span className="font-medium text-slate-700">{div.exDate}</span></span>
                                                                    <span className="text-slate-300 hidden md:inline">|</span>
                                                                    <span>DPS: <span className="font-medium text-slate-700">Rs. {div.amount}</span></span>
                                                                    <span className="text-slate-300 hidden md:inline">|</span>
                                                                    <span className="text-slate-600 font-medium">Qty: {div.eligibleQty}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto pl-1 md:pl-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                                                            <div className="text-right">
                                                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Net Payout</div>
                                                                <div className="text-xl font-bold text-emerald-600 font-mono tracking-tight">Rs. {estNet.toLocaleString()}</div>
                                                            </div>
                                                            <div className="flex flex-col gap-2 min-w-[100px]">
                                                                {showDismissed ? (
                                                                    <button onClick={() => handleRestoreMissed(div)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"><Undo2 size={14} /> Restore</button>
                                                                ) : (
                                                                    <>
                                                                        <button onClick={() => handleAddMissed(div)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-indigo-600/20 transition-all active:scale-95">Add Income</button>
                                                                        <button onClick={() => handleIgnoreMissed(div)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors">Dismiss</button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* --- TAB 2: FUTURE DIVIDENDS --- */}
                {activeTab === 'FUTURE' && (
                    <>
                        {!futureScanned && !loadingFuture && (
                            <div className="text-center py-10 animate-in fade-in">
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
                                    <CalendarClock size={40} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Check for Upcoming Payouts</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                    This will scan the official PSX data portal for your {uniqueTickersCount} held stocks to find declared dividends with future book closure dates.
                                </p>
                                <button onClick={handleScanFuture} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 mx-auto">
                                   <Search size={18} /> Scan Official Data
                                </button>
                            </div>
                        )}

                        {loadingFuture && (
                            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
                                <Loader2 size={40} className="animate-spin text-emerald-600 mb-4" />
                                <h4 className="text-slate-700 font-bold mb-1">Checking Companies...</h4>
                                <p className="text-slate-400 text-sm">Fetching live announcements from PSX...</p>
                            </div>
                        )}

                        {futureScanned && !loadingFuture && (
                            <div className="space-y-6 animate-in fade-in">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <h3 className="text-slate-800 font-bold text-lg">Upcoming Dividends ({futurePayouts.length})</h3>
                                    <button onClick={handleScanFuture} className="text-emerald-600 text-xs font-bold hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
                                </div>

                                {futurePayouts.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                                        <p className="text-slate-500 font-medium">No upcoming dividends found for your stocks.</p>
                                        <p className="text-slate-400 text-xs mt-1">Check back later or ensure your tickers match PSX symbols.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {futurePayouts.map((p, idx) => (
                                            <div key={idx} className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4 hover:border-emerald-300 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="bg-emerald-50 text-emerald-700 font-bold w-12 h-12 rounded-lg flex items-center justify-center text-sm">{p.ticker}</div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{p.details}</div>
                                                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">Announced: {p.announceDate}</span>
                                                            <span>•</span>
                                                            <span className="text-emerald-600 font-bold">Book Closure: {p.bookClosure}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 flex items-start gap-2">
                                    <Info size={14} className="shrink-0 mt-0.5" />
                                    <p>Note: These are announcements found on the live PSX portal. Dividends are typically credited to your bank account within 10-15 working days after the Book Closure start date.</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

            </div>
        </div>
    </div>
  );
};
