import React, { useState } from 'react';
import { Portfolio, Holding } from '../types';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPortfolioId: string;
  portfolios: Portfolio[];
  holdings: Holding[];
  onTransfer: (ticker: string, quantity: number, destPortfolioId: string, date: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen, onClose, currentPortfolioId, portfolios, holdings, onTransfer
}) => {
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [destPortfolioId, setDestPortfolioId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const availablePortfolios = portfolios.filter(p => p.id !== currentPortfolioId);
  const selectedHolding = holdings.find(h => h.ticker === ticker);
  const maxQty = selectedHolding ? selectedHolding.quantity : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !quantity || !destPortfolioId) return;
    if (Number(quantity) > maxQty) {
        alert("Insufficient quantity to transfer.");
        return;
    }
    onTransfer(ticker, Number(quantity), destPortfolioId, date);
    onClose();
    // Reset form
    setTicker(''); setQuantity(''); setDestPortfolioId('');
  };

  return (
    // MODAL CONTAINER: Top Aligned with glassmorphism
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-start justify-center p-4 pt-20 md:pt-24 transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        
        {/* Premium Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm">
                <ArrowRightLeft size={20} />
            </div>
            Transfer Stock
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          <div className="bg-blue-50/80 dark:bg-blue-500/10 p-4 rounded-2xl border border-blue-200/60 dark:border-blue-500/20 flex gap-3 shadow-sm">
             <AlertCircle className="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" size={18} />
             <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                Transferring moves the stock at its <strong>current average cost</strong>. It does not trigger realized gains in the source portfolio.
             </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Stock to Transfer</label>
            <div className="relative">
                <select 
                    required 
                    value={ticker} 
                    onChange={(e) => setTicker(e.target.value)} 
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm appearance-none cursor-pointer transition-all"
                >
                    <option value="">Select Asset</option>
                    {holdings.map(h => (
                        <option key={h.ticker} value={h.ticker}>{h.ticker} (Avail: {h.quantity})</option>
                    ))}
                </select>
                <div className="absolute right-4 top-4 text-slate-400 pointer-events-none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Quantity</label>
                <input 
                    required 
                    type="number" 
                    max={maxQty}
                    value={quantity} 
                    onChange={(e) => setQuantity(Number(e.target.value))} 
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 shadow-sm tabular-nums transition-all"
                />
             </div>
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Date</label>
                <input 
                    required 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 shadow-sm dark:color-scheme-dark transition-all"
                />
             </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Destination Portfolio</label>
            <div className="relative">
                <select 
                    required 
                    value={destPortfolioId} 
                    onChange={(e) => setDestPortfolioId(e.target.value)} 
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm appearance-none cursor-pointer transition-all"
                >
                    <option value="">Select Destination</option>
                    {availablePortfolios.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <div className="absolute right-4 top-4 text-slate-400 pointer-events-none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md shadow-blue-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-6 text-sm">
             <ArrowRightLeft size={18} /> Confirm Transfer
          </button>
        </form>
      </div>
    </div>
  );
};
