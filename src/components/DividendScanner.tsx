import React, { useState } from 'react';
import { Transaction, DividendAnnouncement } from '../types';
import { fetchDividends } from '../services/gemini';
import { Coins, Loader2, CheckCircle, Calendar, Search, X, Trash2, AlertTriangle, Settings, RefreshCw, Sparkles, Building2 } from 'lucide-react';

interface DividendScannerProps {
  transactions: Transaction[];
  onAddTransaction: (t: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

// Internal type for the scanner list
interface FoundDividend extends DividendAnnouncement {
    eligibleQty: number;
    broker: string;
}

export const DividendScanner: React.FC<DividendScannerProps> = ({ 
  transactions, onAddTransaction, isOpen, onClose, onOpenSettings 
}) => {
  const [loading, setLoading] = useState(false);
  const [foundDividends, setFoundDividends] = useState<FoundDividend[]>([]);
  const [scanned, setScanned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper: Get breakdown of holdings by BROKER on a specific date
  const getHoldingsBreakdownOnDate = (ticker: string, targetDate: string) => {
      const breakdown: Record<string, number> = {};

      // 1. Filter relevant transactions (Buy/Sell only, up to Ex-Date)
      const relevantTx = transactions.filter(t => 
          t.ticker === ticker && 
          t.date <= targetDate && 
          (t.type === 'BUY' || t.type === 'SELL')
      );
      
      // 2. Aggregate per broker
      relevantTx.forEach(t => {
          const brokerName = t.broker || 'Unknown Broker';
          if (!breakdown[brokerName]) breakdown[brokerName] = 0;

          if (t.type === 'BUY') breakdown[brokerName] += t.quantity;
          if (t.type === 'SELL') breakdown[brokerName] -= t.quantity;
      });
      
      // 3. Filter out zero/negative holdings
      Object.keys(breakdown).forEach(key => {
          if (breakdown[key] <= 0) delete breakdown[key];
      });
      
      return breakdown;
  };

  const handleScan = async () => {
      setLoading(true);
      setErrorMsg(null);
      
      const tickers = Array.from(new Set(transactions.map(t => t.ticker))) as string[];
      
      if (tickers.length === 0) {
          setLoading(false);
          setScanned(true);
          return;
      }

      try {
          const announcements = await fetchDividends(tickers);
          const newEligible: FoundDividend[] = [];

          announcements.forEach(ann => {
              // Get quantity split by broker (e.g. { 'KASB': 500, 'AKD': 200 })
              const brokerMap = getHoldingsBreakdownOnDate(ann.ticker, ann.exDate);

              Object.entries(brokerMap).forEach(([brokerName, qty]) => {
                  
                  // CHECK: Has this specific dividend (Ticker + Date + Broker) already been added to history?
                  const alreadyRecorded = transactions.some(t => 
                      t.type === 'DIVIDEND' &&
                      t.ticker === ann.ticker &&
                      t.date === ann.exDate && // Usually recorded on ex-date or payout date
                      (t.broker || 'Unknown Broker') === brokerName
                  );

                  if (!alreadyRecorded) {
                      newEligible.push({ 
                          ...ann, 
                          eligibleQty: qty,
                          broker: brokerName
                      });
                  }
              });
          });
          
          // MERGE: Add to list if not currently visible in the scanner
          // This allows "Dismissed" items to reappear if scanned again (because they aren't in history yet)
          setFoundDividends(prev => {
              // Create a set of currently visible IDs
              const currentIds = new Set(prev.map(d => `${d.ticker}-${d.exDate}-${d.broker}`));
              
              // Only add if not currently visible
              const uniqueNew = newEligible.filter(d => 
                  !currentIds.has(`${d.ticker}-${d.exDate}-${d.broker}`)
              );
              
              return [...prev, ...uniqueNew];
          });

          setScanned(true);
      } catch (e: any) {
          console.error(e);
          setErrorMsg(e.message || "Failed to scan. Check API Key.");
      } finally {
          setLoading(false);
      }
  };

  const handleAdd = (div: FoundDividend) => {
      const totalAmount = div.eligibleQty * div.amount;
      const wht = totalAmount * 0.15;
      
      onAddTransaction({
          ticker: div.ticker,
          type: 'DIVIDEND',
          quantity: div.eligibleQty,
          price: div.amount,
          date: div.exDate,
          tax: wht,
          commission: 0,
          cdcCharges: 0,
          broker: div.broker, // Save with specific broker
          notes: `${div.type} Dividend (${div.period || 'N/A'})`
      });
      
      // Remove from list immediately
      setFoundDividends(prev => prev.filter(d => d !== div));
  };

  const handleIgnore = (div: FoundDividend) => {
      // Just remove from view. A new scan will bring it back if not added to history.
      setFoundDividends(prev => prev.filter(d => d !== div));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Coins className="text-indigo-600" size={24} />
                    Dividend Scanner
                </h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative">
                
                {/* INITIAL STATE */}
                {!scanned && foundDividends.length === 0 && !loading && !errorMsg && (
                    <div className="text-center py-10">
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                            <Sparkles size={40} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Find Unclaimed Income</h3>
                        <p className="text-slate-500 mb-8 max-w-md mx-auto">
                            We will check market data for recent dividends and compare them against your specific broker holdings.
                        </p>
                        <button 
                            onClick={handleScan}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 mx-auto"
                        >
                           <Search size={18} /> Scan Portfolio
                        </button>
                    </div>
                )}

                {/* LOADING STATE */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
                        <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
                        <h4 className="text-slate-700 font-bold mb-1">Scanning Market Data...</h4>
                        <p className="text-slate-400 text-sm">Checking historical eligibility by broker...</p>
                    </div>
                )}

                {/* ERROR STATE */}
                {errorMsg && !loading && (
                    <div className="text-center py-10 bg-rose-50/50 rounded-xl border border-rose-100">
                        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-500">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="font-bold text-slate-800 mb-1">Scanner Error</h3>
                        <p className="text-slate-500 mb-6 text-sm">{errorMsg}</p>
                        <div className="flex justify-center gap-3">
                            {onOpenSettings && (
                                <button onClick={() => { onClose(); onOpenSettings(); }} className="bg-white border border-rose-200 text-rose-600 font-bold py-2 px-4 rounded-lg text-sm shadow-sm hover:bg-rose-50">
                                    Check Settings
                                </button>
                            )}
                            <button onClick={handleScan} className="bg-rose-600 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-sm hover:bg-rose-700">
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* SUCCESS STATE (Zero Found) */}
                {scanned && !loading && foundDividends.length === 0 && !errorMsg && (
                     <div className="text-center py-16">
                        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">All Caught Up</h3>
                        <p className="text-slate-400 text-sm mb-6">No new eligible dividends found in your history.</p>
                        <button onClick={handleScan} className="text-indigo-600 text-sm font-bold hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 mx-auto">
                            <RefreshCw size={14} /> Force Re-Scan
                        </button>
                     </div>
                )}

                {/* RESULTS LIST */}
                {foundDividends.length > 0 && !loading && (
                    <div className="space-y-6">
                        {/* HEADER WITH SCAN BUTTON */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                                <h3 className="text-slate-800 font-bold text-lg">Found {foundDividends.length} Eligible Dividends</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Estimated based on broker-wise holdings.</p>
                            </div>
                            <button 
                                onClick={handleScan}
                                className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                            >
                                <RefreshCw size={14} /> Scan More
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            {foundDividends.map((div, idx) => {
                                const estTotal = div.eligibleQty * div.amount;
                                const estNet = estTotal * 0.85; 

                                return (
                                    <div key={`${div.ticker}-${div.exDate}-${div.broker}-${idx}`} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                        
                                        {/* Decorative Side Bar */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>

                                        <div className="flex items-start gap-4">
                                            <div className="bg-indigo-50 h-12 w-16 rounded-lg flex items-center justify-center text-indigo-700 font-bold text-sm shadow-sm border border-indigo-100">
                                                {div.ticker}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-slate-800 font-bold text-base">{div.type} Dividend</span>
                                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                                                        <Building2 size={10} /> {div.broker}
                                                    </span>
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
                                                <div className="text-xl font-bold text-emerald-600 font-mono tracking-tight">Rs. {estNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                            </div>
                                            
                                            <div className="flex flex-col gap-2 min-w-[100px]">
                                                <button 
                                                    onClick={() => handleAdd(div)}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                                                >
                                                    Add Income
                                                </button>
                                                <button 
                                                    onClick={() => handleIgnore(div)}
                                                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                                                    title="Dismiss from this view (will reappear on next scan if not added)"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
