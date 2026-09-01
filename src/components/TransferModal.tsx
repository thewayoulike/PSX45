import React, { useEffect, useMemo, useState } from 'react';
import { Portfolio, Holding, Broker, PortfolioType } from '../types';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { todayPK } from '../utils/dates';
import { isFundTicker } from '../utils/fundId';
import { formatAssetLabel } from '../utils/fundDisplay';
import { fmtFundNav, fmtFundUnits, roundFundUnits } from '../utils/fundFormat';
import { MutualFundRecord } from '../services/mufapData';
import { FundPicker } from './FundPicker';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPortfolioId: string;
  portfolios: Portfolio[];
  holdings: Holding[];
  brokers?: Broker[];
  displayNames?: Record<string, string>;
  portfolioType?: PortfolioType;
  fundCatalog?: Record<string, MutualFundRecord>;
  currentPrices?: Record<string, number>;
  onTransfer: (ticker: string, quantity: number, destPortfolioId: string, date: string, sourceBroker?: string) => void;
  onConvertFunds?: (fromTicker: string, quantity: number, toTicker: string, date: string) => void;
}

/** Earliest broker in the brokers list that still holds this ticker. */
export const firstBrokerHolding = (ticker: string, holdings: Holding[], brokers: Broker[] = []): Holding | undefined => {
  const lots = holdings.filter(h => h.ticker === ticker && h.quantity > 0);
  if (lots.length === 0) return undefined;
  const orderedBrokers = [...brokers.filter(b => b.isDefault), ...brokers.filter(b => !b.isDefault)];
  for (const b of orderedBrokers) {
    const hit = lots.find(h => h.broker === b.name);
    if (hit) return hit;
  }
  return lots[0];
};

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  currentPortfolioId,
  portfolios,
  holdings,
  brokers = [],
  displayNames = {},
  portfolioType = 'PSX',
  fundCatalog = {},
  currentPrices = {},
  onTransfer,
  onConvertFunds,
}) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const [ticker, setTicker] = useState('');
  const [destFund, setDestFund] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [destPortfolioId, setDestPortfolioId] = useState('');
  const [date, setDate] = useState(todayPK());

  useEffect(() => {
    if (isOpen) setDate(todayPK());
  }, [isOpen]);

  useEffect(() => {
    if (destFund && destFund === ticker) setDestFund('');
  }, [ticker, destFund]);

  const tickerLots = useMemo(() => {
    const seen = new Set<string>();
    const lots: Holding[] = [];
    holdings.forEach(h => {
      if (h.quantity <= 0 || seen.has(h.ticker)) return;
      const lot = firstBrokerHolding(h.ticker, holdings, brokers);
      if (!lot) return;
      seen.add(h.ticker);
      lots.push(lot);
    });
    return lots.sort((a, b) =>
      formatAssetLabel(a.ticker, displayNames).localeCompare(formatAssetLabel(b.ticker, displayNames))
    );
  }, [holdings, brokers, displayNames]);

  if (!isOpen) return null;

  const availablePortfolios = portfolios.filter(p => p.id !== currentPortfolioId);
  const selectedHolding = ticker ? firstBrokerHolding(ticker, holdings, brokers) : undefined;
  const maxQty = selectedHolding ? selectedHolding.quantity : 0;
  const avgCost = selectedHolding ? selectedHolding.avgPrice : 0;

  const sellNav = ticker
    ? (currentPrices[ticker] || selectedHolding?.currentPrice || fundCatalog[ticker]?.repurchase || fundCatalog[ticker]?.nav || 0)
    : 0;
  const buyNav = destFund
    ? (currentPrices[destFund] || fundCatalog[destFund]?.offer || fundCatalog[destFund]?.nav || 0)
    : 0;
  const qtyNum = Number(quantity) || 0;
  const estProceeds = qtyNum > 0 && sellNav > 0 ? qtyNum * sellNav : 0;
  const estDestUnits = estProceeds > 0 && buyNav > 0 ? roundFundUnits(estProceeds / buyNav) : 0;

  const formatQty = (q: number, t: string) => (isFundTicker(t) ? fmtFundUnits(q) : q.toLocaleString());

  const optionLabel = (h: Holding) => {
    const name = formatAssetLabel(h.ticker, displayNames);
    const brokerPart = !isFund && h.broker ? ` · ${h.broker}` : '';
    return `${name}${brokerPart} (Avail: ${formatQty(h.quantity, h.ticker)})`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !quantity || !selectedHolding) return;
    if (Number(quantity) > maxQty) {
        alert(`Insufficient ${isFund ? 'units' : 'quantity'} to transfer.`);
        return;
    }
    if (isFund) {
      if (!destFund || destFund === ticker || !onConvertFunds) return;
      onConvertFunds(ticker, Number(quantity), destFund, date);
    } else {
      if (!destPortfolioId) return;
      onTransfer(ticker, Number(quantity), destPortfolioId, date, selectedHolding.broker);
    }
    onClose();
    setTicker(''); setQuantity(''); setDestPortfolioId(''); setDestFund('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-start justify-center p-4 pt-20 md:pt-24 transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm">
                <ArrowRightLeft size={20} />
            </div>
            {isFund ? 'Convert Funds' : 'Transfer Stock'}
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
                {isFund
                  ? <>Redeem units from one fund and subscribe into another <strong>within this portfolio</strong>. Proceeds stay as cash between the two legs — nothing is withdrawn to your bank.</>
                  : <>Transfer uses the <strong>buy cost of the first broker</strong> that still holds the stock. Other brokers&apos; lots are left in place. No realized gain is booked.</>}
             </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
              {isFund ? 'Convert From' : 'Stock to Transfer'}
            </label>
            <div className="relative">
                <select 
                    required 
                    value={ticker} 
                    onChange={(e) => { setTicker(e.target.value); setQuantity(''); }} 
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm appearance-none cursor-pointer transition-all"
                >
                    <option value="">{isFund ? 'Select source fund' : 'Select Asset'}</option>
                    {tickerLots.map(h => (
                        <option key={`${h.ticker}|${h.broker || ''}`} value={h.ticker}>
                          {optionLabel(h)}
                        </option>
                    ))}
                </select>
                <div className="absolute right-4 top-4 text-slate-400 pointer-events-none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </div>
            {selectedHolding && (
              <p className="mt-1.5 ml-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {isFund ? (
                  <>Repurchase NAV: Rs. {fmtFundNav(sellNav)}{avgCost > 0 ? ` · avg cost Rs. ${fmtFundNav(avgCost)}` : ''}</>
                ) : (
                  <>Buy cost: Rs. {avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{selectedHolding.broker ? ` at ${selectedHolding.broker}` : ''}</>
                )}
              </p>
            )}
          </div>

          {isFund && (
            <div>
              <FundPicker
                catalog={fundCatalog}
                value={destFund}
                onChange={(id) => setDestFund(id)}
                label="Convert To"
              />
              {destFund && buyNav > 0 && (
                <p className="mt-1.5 ml-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Offer NAV: Rs. {fmtFundNav(buyNav)}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                  {isFund ? 'Units to Convert' : 'Quantity'}
                </label>
                <input 
                    required 
                    type="number" 
                    step="any"
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

          {isFund && estProceeds > 0 && destFund && buyNav > 0 && (
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl px-4 py-3 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                ≈ Rs. {estProceeds.toLocaleString(undefined, { maximumFractionDigits: 2 })} → {fmtFundUnits(estDestUnits)} units
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">into {formatAssetLabel(destFund, displayNames)}</span>
            </div>
          )}

          {!isFund && (
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
          )}

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md shadow-blue-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-6 text-sm">
             <ArrowRightLeft size={18} /> {isFund ? 'Confirm Conversion' : 'Confirm Transfer'}
          </button>
        </form>
      </div>
    </div>
  );
};
