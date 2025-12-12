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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
            Update Market Prices
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"> <X size={24} /> </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                {uniqueTickers.length === 0 && ( <p className="text-slate-400 text-center py-4">No holdings to update.</p> )}
                
                {uniqueTickers.map(ticker => (
                    <div key={ticker} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-lg">{ticker}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-sm">PKR</span>
                            <input 
                                type="number" 
                                step="0.01"
                                value={prices[ticker] || ''}
                                onChange={e => handleChange(ticker, e.target.value)}
                                className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-right text-slate-800 dark:text-slate-200 font-mono focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"> <Save size={18} /> Save Prices </button>
            </div>
        </form>
      </div>
    </div>
  );
};
