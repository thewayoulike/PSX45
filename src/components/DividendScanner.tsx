import React, { useState } from 'react';
import { Transaction, FoundDividend, CompanyPayout } from '../types'; 
import { fetchDividends } from '../services/gemini';
import { fetchCompanyPayouts, fetchMarketWideDividends } from '../services/financials'; 
import { Coins, Loader2, CheckCircle, Calendar, Search, X, History, RefreshCw, Sparkles, Building2, Clock, Undo2, CalendarClock, Info, AlertTriangle, Globe } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'MISSED' | 'FUTURE' | 'MARKET'>('MISSED');
  
  // --- STATES ---
  const [loading, setLoading] = useState(false);
  const [foundDividends, setFoundDividends] = useState<FoundDividend[]>(savedResults);
  const [dismissedItems, setDismissedItems] = useState<FoundDividend[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [scanned, setScanned] = useState(savedResults.length > 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useDeepScan, setUseDeepScan] = useState(false);

  const [futurePayouts, setFuturePayouts] = useState<CompanyPayout[]>([]);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [futureScanned, setFutureScanned] = useState(false);

  const [marketPayouts, setMarketPayouts] = useState<CompanyPayout[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [marketScanned, setMarketScanned] = useState(false);

  const updateDividends = (newDividends: FoundDividend[]) => { setFoundDividends(newDividends); onSaveResults(newDividends); };

  const getHoldingsBreakdownOnDate = (ticker: string, targetDate: string) => {
      const breakdown: Record<string, number> = {};
      const relevantTx = transactions.filter(t => t.ticker === ticker && t.date < targetDate && (t.type === 'BUY' || t.type === 'SELL'));
      relevantTx.forEach(t => {
          const brokerName = t.broker || 'Unknown Broker';
          if (!breakdown[brokerName]) breakdown[brokerName] = 0;
          if (t.type === 'BUY') breakdown[brokerName] += t.quantity;
          if (t.type === 'SELL') breakdown[brokerName] -= t.quantity;
      });
      Object.keys(breakdown).forEach(key => { if (breakdown[key] <= 0) delete breakdown[key]; });
      return breakdown;
  };

  const handleScanMissed = async () => {
      setLoading(true); setErrorMsg(null);
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
                  if (!alreadyRecorded) newEligible.push({ ...ann, eligibleQty: qty, broker: brokerName });
              });
          });
          updateDividends(newEligible); setScanned(true);
      } catch (e: any) { setErrorMsg(e.message || "Failed to scan."); } finally { setLoading(false); }
  };

  const handleScanFuture = async () => {
      setLoadingFuture(true);
      const tickers = Array.from(new Set(transactions.map(t => t.ticker))) as string[];
      const allUpcoming: CompanyPayout[] = [];
      for (const ticker of tickers) {
          if (['CASH', 'CGT', 'ANNUAL FEE'].includes(ticker)) continue;
          try {
              const payouts = await fetchCompanyPayouts(ticker);
              allUpcoming.push(...payouts.filter(p => p.isUpcoming));
          } catch (e) { console.warn(e); }
      }
      setFuturePayouts(allUpcoming); setFutureScanned(true); setLoadingFuture(false);
  };

  const handleScanMarket = async () => {
      setLoadingMarket(true);
      try {
          const payouts = await fetchMarketWideDividends();
          setMarketPayouts(payouts);
          setMarketScanned(true);
      } catch (e) { console.error("Market scan failed", e); } finally { setLoadingMarket(false); }
  };

  const handleAddMissed = (div: FoundDividend) => {
      const totalAmount = div.eligibleQty * div.amount;
      const wht = totalAmount * 0.15;
      onAddTransaction({ ticker: div.ticker, type: 'DIVIDEND', quantity: div.eligibleQty, price: div.amount, date: div.exDate, tax: wht, commission: 0, cdcCharges: 0, broker: div.broker, notes: `${div.type} Dividend (${div.period || 'N/A'})` });
      updateDividends(foundDividends.filter(d => d !== div));
  };

  const handleIgnoreMissed = (div: FoundDividend) => { setDismissedItems(prev => [div, ...prev]); updateDividends(foundDividends.filter(d => d !== div)); };
  const handleRestoreMissed = (div: FoundDividend) => { setDismissedItems(prev => prev.filter(d => d !== div)); updateDividends([div, ...foundDividends]); };

  if (!isOpen) return null;
  const uniqueTickersCount = new Set(transactions.map(t => t.ticker)).size;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="bg-slate-50/50 border-b border-slate-200">
                <div className="p-6 pb-0 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"> <Coins className="text-indigo-600" size={24} /> Dividend Scanner </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mb-4"><X size={24} /></button>
                </div>
                <div className="flex px-6 gap-6 mt-4 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('MISSED')} className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'MISSED' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}> <History size={16} /> Find Missed (Past) </button>
                    <button onClick={() => setActiveTab('FUTURE')} className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'FUTURE' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}> <CalendarClock size={16} /> My Upcoming </button>
                    <button onClick={() => setActiveTab('MARKET')} className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'MARKET' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}> <Globe size={16} /> Market Watch (All) </button>
                </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative">
                {activeTab === 'MISSED' && (
                    <>
                        {!scanned && !loading && (
                            <div className="text-center py-10 animate-in fade-in">
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600"> <Sparkles size={40} /> </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Find Unclaimed Income</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto"> Scanning {uniqueTickersCount} unique stock(s) in your history. </p>
                                <button onClick={handleScanMissed} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2 mx-auto"> <Search size={18} /> Scan History </button>
                            </div>
                        )}
                        {loading && <div className="flex flex-col items-center justify-center py-20"><Loader2 size={40} className="animate-spin text-indigo-600 mb-4" /><p className="text-slate-400 text-sm">Scanning Market Data...</p></div>}
                        {!loading && scanned && foundDividends.length === 0 && !showDismissed && (
                             <div className="text-center py-16">
                                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500"><CheckCircle size={32} /></div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1">All Caught Up</h3>
                                <div className="flex flex-col items-center gap-3 mt-4">
                                    <button onClick={handleScanMissed} className="text-indigo-600 text-sm font-bold hover:bg-indigo-50 px-4 py-2 rounded-lg flex items-center gap-2"><RefreshCw size={14} /> Force Re-Scan</button>
                                    {dismissedItems.length > 0 && <button onClick={() => setShowDismissed(true)} className="text-slate-500 text-xs hover:text-slate-700 underline">Show Dismissed</button>}
                                </div>
                             </div>
                        )}
                        {(foundDividends.length > 0 || showDismissed) && !loading && (
                            <div className="space-y-4">
                                <div className="flex justify-between pb-2 border-b"><h3 className="font-bold">Results</h3>{dismissedItems.length > 0 && !showDismissed && <button onClick={() => setShowDismissed(true)} className="text-xs text-slate-500">History</button>}</div>
                                {(showDismissed ? dismissedItems : foundDividends).map((div, i) => (
                                    <div key={i} className="bg-white border rounded-xl p-4 flex justify-between items-center shadow-sm">
                                        <div className="flex gap-4 items-center">
                                            <div className="bg-indigo-50 w-12 h-12 rounded-lg flex items-center justify-center text-indigo-700 font-bold text-sm">{div.ticker}</div>
                                            <div> <div className="font-bold text-slate-800">{div.type} Dividend</div> <div className="text-xs text-slate-500">Ex: {div.exDate} | Rs. {div.amount}</div> </div>
                                        </div>
                                        <button onClick={() => showDismissed ? handleRestoreMissed(div) : handleAddMissed(div)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold">{showDismissed ? 'Restore' : 'Add'}</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'FUTURE' && (
                    <>
                        {!futureScanned && !loadingFuture && (
                            <div className="text-center py-10 animate-in fade-in">
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600"> <CalendarClock size={40} /> </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Check My Holdings</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto"> Scan official data for your {uniqueTickersCount} stocks. </p>
                                <button onClick={handleScanFuture} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2 mx-auto"> <Search size={18} /> Scan Portfolio </button>
                            </div>
                        )}
                        {loadingFuture && <div className="flex flex-col items-center justify-center py-20"><Loader2 size={40} className="animate-spin text-emerald-600 mb-4" /><p className="text-slate-400 text-sm">Checking Companies...</p></div>}
                        {futureScanned && !loadingFuture && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100"> <h3 className="text-slate-800 font-bold">Upcoming ({futurePayouts.length})</h3> <button onClick={handleScanFuture} className="text-emerald-600 text-xs font-bold flex items-center gap-1"><RefreshCw size={12} /> Refresh</button> </div>
                                {futurePayouts.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm">No upcoming dividends for your stocks.</div> : futurePayouts.map((p, i) => (
                                    <div key={i} className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm flex items-center gap-4">
                                        <div className="bg-emerald-50 text-emerald-700 font-bold w-12 h-12 rounded-lg flex items-center justify-center text-sm">{p.ticker}</div>
                                        <div> <div className="font-bold text-slate-800">{p.details}</div> <div className="text-xs text-slate-500 mt-0.5"><span className="bg-slate-100 px-1.5 py-0.5 rounded">Announced: {p.announceDate}</span> • <span className="text-emerald-600 font-bold">Book Closure: {p.bookClosure}</span></div> </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'MARKET' && (
                    <>
                        {!marketScanned && !loadingMarket && (
                            <div className="text-center py-10 animate-in fade-in">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600"> <Globe size={40} /> </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Scan Entire Market</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto"> Check the latest PSX Financial Announcements for ANY upcoming dividends. </p>
                                <button onClick={handleScanMarket} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2 mx-auto"> <Search size={18} /> Scan All Companies </button>
                            </div>
                        )}
                        {loadingMarket && <div className="flex flex-col items-center justify-center py-20"><Loader2 size={40} className="animate-spin text-blue-600 mb-4" /><p className="text-slate-400 text-sm">Fetching Announcements...</p></div>}
                        {marketScanned && !loadingMarket && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100"> <h3 className="text-slate-800 font-bold">Market Opportunities ({marketPayouts.length})</h3> <button onClick={handleScanMarket} className="text-blue-600 text-xs font-bold flex items-center gap-1"><RefreshCw size={12} /> Refresh</button> </div>
                                {marketPayouts.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm">No upcoming market-wide dividends found.</div> : marketPayouts.map((p, i) => (
                                    <div key={i} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm flex items-center gap-4 hover:border-blue-300 transition-colors">
                                        <div className="bg-blue-50 text-blue-700 font-bold w-12 h-12 rounded-lg flex items-center justify-center text-[10px] text-center leading-tight overflow-hidden p-1">{p.ticker}</div>
                                        <div className="flex-1"> <div className="font-bold text-slate-800">{p.details}</div> <div className="text-xs text-slate-500 mt-0.5"><span className="text-blue-600 font-bold">Book Closure: {p.bookClosure}</span></div> </div>
                                        <div className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-medium">{p.financialResult}</div>
                                    </div>
                                ))}
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 flex items-start gap-2"> <Info size={14} className="shrink-0 mt-0.5" /> <p>Tip: These are pulled directly from the PSX "Financial Announcements" board. Companies are listed by Name.</p> </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    </div>
  );
};
