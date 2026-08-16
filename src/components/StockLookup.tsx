import React, { useState } from 'react';
import { fetchBatchPSXPrices } from '../services/psxData';
import { Search, Loader2, ArrowRight, AlertCircle } from 'lucide-react';

export interface LookupQuote {
  price: number;
  ldcp: number;
  sector: string;
  listedIn: string;
}

interface Props {
  // Prices we already have (manualPrices) — lets us open instantly without a fetch.
  seededPrices: Record<string, number>;
  // Persist a freshly-fetched quote into the app's price maps.
  onResolve: (ticker: string, quote: LookupQuote) => void;
  // Open the stock's profile.
  onOpen: (ticker: string) => void;
}

export const StockLookup: React.FC<Props> = ({ seededPrices, onResolve, onOpen }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setError(null);

    // Already priced? Open immediately.
    if (seededPrices[sym] && seededPrices[sym] > 0) {
      onOpen(sym);
      setInput('');
      return;
    }

    // Otherwise fetch a live quote for just this symbol.
    setLoading(true);
    try {
      const data = await fetchBatchPSXPrices([sym]);
      const q = (data as any)[sym];
      if (q && q.price > 0) {
        onResolve(sym, {
          price: q.price,
          ldcp: q.ldcp || 0,
          sector: q.sector || '',
          listedIn: q.listedIn || '',
        });
        onOpen(sym);
        setInput('');
      } else {
        setError(`Couldn't find "${sym}" on PSX. Check the symbol, or run Sync first.`);
      }
    } catch (e) {
      console.error('StockLookup fetch failed', e);
      setError('Price lookup failed. Try again or run Sync.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Search size={16} className="text-brand-500" />
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest">
          Open any PSX stock
        </h3>
        <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· even ones you've never traded</span>
      </div>

      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={input}
            onChange={e => { setInput(e.target.value); if (error) setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') go(); }}
            placeholder="Enter a symbol, e.g. ENGRO"
            className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 font-bold uppercase tracking-wide dark:text-slate-100 transition-all"
          />
        </div>
        <button
          onClick={go}
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Open
        </button>
      </div>

      {error && (
        <p className="mt-2.5 text-xs text-rose-500 font-medium flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
};
