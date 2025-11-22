import React, { useState } from 'react';
import { Transaction, DividendAnnouncement } from '../types';
import { fetchDividends } from '../services/gemini';
import { Coins, Loader2, CheckCircle, Calendar, Search, X, Trash2 } from 'lucide-react';

interface DividendScannerProps {
  transactions: Transaction[];
  onAddTransaction: (t: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const DividendScanner: React.FC<DividendScannerProps> = ({ transactions, onAddTransaction, isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [foundDividends, setFoundDividends] = useState<Array<DividendAnnouncement & { eligibleQty: number }>>([]);
  const [scanned, setScanned] = useState(false);

  const getHoldingsOnDate = (ticker: string, targetDate: string) => {
      const relevantTx = transactions.filter(t => 
          t.ticker === ticker && 
          t.date <= targetDate && 
          t.type !== 'DIVIDEND'
      );
      
      let qty = 0;
      relevantTx.forEach(t => {
          if (t.type === 'BUY') qty += t.quantity;
          if (t.type === 'SELL') qty -= t.quantity;
      });
      
      return Math.max(0, qty);
  };

  const handleScan = async () => {
      setLoading(true);
      setFoundDividends([]);
      
      const tickers = Array.from(new Set(transactions.map(t => t.ticker))) as string[];
      
      if (tickers.length === 0) {
          setLoading(false);
          setScanned(true);
          return;
      }

      try {
          const announcements = await fetchDividends(tickers);
          
          const eligible: Array<DividendAnnouncement & { eligibleQty: number }> = [];

          announcements.forEach(ann => {
              const qtyOnExDate = getHoldingsOnDate(ann.ticker, ann.exDate);
              if (qtyOnExDate > 0) {
                  eligible.push({ ...ann, eligibleQty: qtyOnExDate });
              }
          });
          
          setFoundDividends(eligible);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
          setScanned(true);
      }
  };

  const handleAdd = (div: DividendAnnouncement & { eligibleQty: number }) => {
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
          cdcCharges: 0
      });
      
      setFoundDividends(prev => prev.filter(d => d !== div));
  };

  const handleIgnore = (div: DividendAnnouncement & { eligibleQty: number }) => {
      setFoundDividends(prev => prev.filter(d => d !== div));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Coins className="text-indigo-600" size={24} />
                    Dividend Scanner
                </h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                {!scanned && !loading && (
                    <div className="text-center py-10">
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                            <Search size={40} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Find Unclaimed Income</h3>
                        <p className="text-slate-500 mb-8 max-w-md mx-auto">
                            We will check market data for recent dividends and compare them against your historical holdings on the ex-dates.
                        </p>
                        <button 
                            onClick={handleScan}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
                        >
                            Scan Portfolio
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="text-center py-20">
                        <Loader2 size={40} className="animate-spin text-indigo-600 mx-auto mb-4" />
                        <p className="text-slate-500">Checking historical eligibility...</p>
                    </div>
                )}

                {scanned && !loading && foundDividends.length === 0 && (
                     <div className="text-center py-10">
                        <CheckCircle size={40} className="text-emerald-500 mx-auto mb-4" />
                        <p className="text-slate-700 font-medium">No missing dividends found.</p>
                        <p className="text-slate-400 text-sm mt-2">You seem to be up to date!</p>
                        <button onClick={handleScan} className="text-indigo-600 text-sm mt-6 hover:underline">Scan Again</button>
                     </div>
                )}

                {foundDividends.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-slate-800 font-semibold">Found {foundDividends.length} Eligible Dividends</h3>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">Estimated WHT: 15%</span>
                        </div>
                        
                        {foundDividends.map((div, idx) => {
                            const estTotal = div.eligibleQty * div.amount;
                            const estNet = estTotal * 0.85; 

                            return (
                                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 font-bold text-sm min-w-[60px] text-center">
                                            {div.ticker}
                                        </div>
                                        <div>
                                            <div className="text-slate-800 font-medium text-sm flex items-center gap-2">
                                                {div.type} Dividend
                                                <span className="text-[10px] text-slate-400 border border-slate-200 px-1.5 rounded">{div.period}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                <span className="flex items-center gap-1"><Calendar size={12} /> Ex-Date: {div.exDate}</span>
                                                <span className="text-slate-300">|</span>
                                                <span>DPS: Rs. {div.amount}</span>
                                            </div>
                                            <div className="mt-2 text-xs text-indigo-600">
                                                Eligible Shares: <span className="font-bold text-slate-900">{div.eligibleQty.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-2 sm:gap-0 min-w-[120px]">
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400 uppercase">Net Payout</div>
                                            <div className="text-lg font-bold text-emerald-600 font-mono">Rs. {estNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                        </div>
                                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                                            <button 
                                                onClick={() => handleAdd(div)}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition-colors flex-1 sm:w-full"
                                            >
                                                Add Income
                                            </button>
                                            <button 
                                                onClick={() => handleIgnore(div)}
                                                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-rose-500 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex-1 sm:w-full"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
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