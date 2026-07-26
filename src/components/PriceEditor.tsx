import React, { useState, useEffect } from 'react';
import { X, Save, TrendingUp } from 'lucide-react';
import { Holding } from '../types';

interface PriceEditorProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: Holding[];
  onUpdatePrices: (updates: Record<string, number>) => void;
}

export const PriceEditor: React.FC<PriceEditorProps> = ({ isOpen, onClose, holdings, onUpdatePrices }) => {
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      holdings.forEach(h => { if (!initial[h.ticker]) initial[h.ticker] = h.currentPrice.toString(); });
      setPrices(initial);
    }
  }, [isOpen, holdings]);

  const handleChange = (ticker: string, value: string) => { setPrices(prev => ({ ...prev, [ticker]: value })); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericUpdates: Record<string, number> = {};
    Object.entries(prices).forEach(([ticker, val]) => { const num = parseFloat(val); if (!isNaN(num)) numericUpdates[ticker] = num; });
    onUpdatePrices(numericUpdates);
    onClose();
  };

  if (!isOpen) return null;

  const uniqueTickers = Array.from(new Set(holdings.map(h => h.ticker)));

  return (
    // MODAL CONTAINER: Top Aligned with glassmorphism
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-start justify-center p-4 pt-16 md:pt-24 transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-md flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Premium Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                <TrendingUp size={20} />
            </div>
            Manual Prices
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          > 
            <X size={20} /> 
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                {uniqueTickers.length === 0 && ( 
                  <p className="text-slate-400 font-medium text-center py-10">No holdings available to update.</p> 
                )}
                
                {uniqueTickers.map(ticker => (
                    <div key={ticker} className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow">
                        <span className="font-display font-black text-slate-900 dark:text-white text-lg tracking-tight">{ticker}</span>
                        <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">PKR</span>
                            <input 
                                type="number" 
                                step="any"
                                value={prices[ticker] || ''}
                                onChange={e => handleChange(ticker, e.target.value)}
                                className="w-28 bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-right text-slate-900 dark:text-slate-100 font-mono tabular-nums text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none shadow-sm transition-all"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Premium Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                <button 
                  type="submit" 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-sm"
                > 
                  <Save size={18} /> Save Prices 
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};
