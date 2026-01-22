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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="text-blue-600 dark:text-blue-400" size={20} />
            Transfer Stock
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 flex gap-3">
             <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
             <p className="text-xs text-blue-700 dark:text-blue-300">
                Transferring moves the stock at its <strong>current average cost</strong>. It does not trigger realized gains in the source portfolio.
             </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Stock to Transfer</label>
            <select 
                required 
                value={ticker} 
                onChange={(e) => setTicker(e.target.value)} 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
                <option value="">Select Asset</option>
                {holdings.map(h => (
                    <option key={h.ticker} value={h.ticker}>{h.ticker} (Avail: {h.quantity})</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Quantity</label>
                <input 
                    required 
                    type="number" 
                    max={maxQty}
                    value={quantity} 
                    onChange={(e) => setQuantity(Number(e.target.value))} 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Date</label>
                <input 
                    required 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white dark:color-scheme-dark"
                />
             </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Destination Portfolio</label>
            <select 
                required 
                value={destPortfolioId} 
                onChange={(e) => setDestPortfolioId(e.target.value)} 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
                <option value="">Select Destination</option>
                {availablePortfolios.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 mt-4">
             <ArrowRightLeft size={18} /> Confirm Transfer
          </button>
        </form>
      </div>
    </div>
  );
};
