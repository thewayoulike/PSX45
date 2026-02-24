// src/components/TradingSimulator.tsx
import React, { useState, useMemo } from 'react';
import { Holding, Broker } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Info, Activity, Calculator, TrendingUp, TrendingDown } from 'lucide-react';

interface TradingSimulatorProps {
  holdings: Holding[];
  brokers: Broker[];
  defaultBrokerId: string;
}

interface SimBuy {
  id: string;
  quantity: number;
  price: number;
}

interface SimSell {
  id: string;
  quantity: number;
  price: number;
  isIntraday: boolean;
}

export const TradingSimulator: React.FC<TradingSimulatorProps> = ({ holdings, brokers, defaultBrokerId }) => {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [buyPositions, setBuyPositions] = useState<SimBuy[]>([]);
  const [sellPositions, setSellPositions] = useState<SimSell[]>([]);

  const activeHolding = holdings.find(h => h.ticker === selectedTicker);
  const broker = brokers.find(b => b.id === defaultBrokerId) || brokers[0] || {} as Broker;

  const calculateFees = (price: number, qty: number) => {
    if (!price || !qty || !broker || !broker.commissionType) return { total: 0 };
    
    const amount = price * qty;
    let commission = 0;
    
    const cType = broker.commissionType || 'PERCENTAGE';
    const r1 = broker.rate1 || 0.15;
    const r2 = broker.rate2 || 0.05;
    
    if (cType === 'PERCENTAGE' || (cType as any) === 'PERCENT') {
      commission = amount * (r1 / 100);
    } else if (cType === 'PER_SHARE') {
      commission = qty * r1;
    } else if (cType === 'FIXED') {
      commission = r1;
    } else if (cType === 'SLAB') {
      commission = amount * (r1 / 100); 
    } else {
      const perShare = qty * r2;
      const percentage = amount * (r1 / 100);
      commission = Math.max(perShare, percentage);
    }
    
    const sst = commission * ((broker.sstRate || 15) / 100);
    const cdcType = broker.cdcType || 'PER_SHARE';
    let cdc = 0;
    
    if (cdcType === 'PER_SHARE') cdc = qty * (broker.cdcRate !== undefined ? broker.cdcRate : 0.005);
    else if (cdcType === 'FIXED') cdc = broker.cdcRate || 0;
    else cdc = Math.max(qty * (broker.cdcRate || 0.005), broker.cdcMin || 0);

    return { total: commission + sst + cdc };
  };

  const analysis = useMemo(() => {
    let totalBuyQty = 0;
    let totalBuyCostWithFees = 0;
    
    // Process Buys
    const processedBuys = buyPositions.map(p => {
        const fees = calculateFees(p.price, p.quantity);
        const cost = (p.price * p.quantity) + fees.total;
        const avgBuy = p.quantity > 0 ? cost / p.quantity : 0;
        totalBuyQty += p.quantity;
        totalBuyCostWithFees += cost;
        return { ...p, fees: fees.total, totalCost: cost, avgBuy };
    });

    const currentQty = activeHolding?.quantity || 0;
    const currentAvg = activeHolding?.avgPrice || 0;
    const currentPrice = activeHolding?.currentPrice || 0;
    
    let historicalQty = currentQty;
    const historicalCost = currentAvg;

    // Create a pool of simulated buys for intraday matching
    const newBuyLots = processedBuys.map(r => ({ id: r.id, qty: r.quantity, cost: r.avgBuy }));

    let totalProfit = 0;
    let totalSellFees = 0;

    // Process Sells (FIFO / Intraday Logic)
    const processedSells = sellPositions.map(p => {
        let qtyToFill = p.quantity;
        let costBasis = 0;
        
        let filledIntraday = 0;
        let filledStandard = 0;

        if (p.isIntraday) {
            // 1. Consume Simulated Buys First (Intraday -> 0 Fees)
            for (const lot of newBuyLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty);
                costBasis += match * lot.cost;
                lot.qty -= match;
                qtyToFill -= match;
                filledIntraday += match;
            }
            // 2. If short, consume from historical holds (FIFO -> Standard Fees)
            if (qtyToFill > 0 && historicalQty > 0) {
                const match = Math.min(qtyToFill, historicalQty);
                costBasis += match * historicalCost;
                historicalQty -= match;
                qtyToFill -= match;
                filledStandard += match;
            }
        } else {
            // 1. Standard FIFO: Consume Historical Holds First (Standard Fees)
            if (qtyToFill > 0 && historicalQty > 0) {
                const match = Math.min(qtyToFill, historicalQty);
                costBasis += match * historicalCost;
                historicalQty -= match;
                qtyToFill -= match;
                filledStandard += match;
            }
            // 2. Then consume Simulated Buys (Still Standard Fees because not intraday)
            for (const lot of newBuyLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty);
                costBasis += match * lot.cost;
                lot.qty -= match;
                qtyToFill -= match;
                filledStandard += match;
            }
        }

        // Apply selling fees ONLY to the Standard Filled portion
        const standardFees = calculateFees(p.price, filledStandard).total;
        const sellFees = standardFees;
        
        const netRevenue = (p.quantity * p.price) - sellFees;
        const profit = netRevenue - costBasis;
        
        totalProfit += profit;
        totalSellFees += sellFees;

        return { ...p, fees: sellFees, netRevenue, costBasis, profit, unfilled: qtyToFill, filledIntraday, filledStandard };
    });

    // Calculate Final Remaining State
    const remainingHistoricalQty = historicalQty;
    const remainingNewBuyLots = newBuyLots.filter(l => l.qty > 0);
    
    let finalRemainingQty = remainingHistoricalQty;
    let finalRemainingCost = remainingHistoricalQty * historicalCost;
    
    remainingNewBuyLots.forEach(l => {
        finalRemainingQty += l.qty;
        finalRemainingCost += (l.qty * l.cost);
    });

    const finalRemainingAvg = finalRemainingQty > 0 ? finalRemainingCost / finalRemainingQty : 0;
    const finalUnrealizedPL = finalRemainingQty > 0 ? (currentPrice - finalRemainingAvg) * finalRemainingQty : 0;
    const currentUnrealizedPL = currentQty > 0 ? (currentPrice - currentAvg) * currentQty : 0;
    
    const overallQtyAfterBuys = currentQty + totalBuyQty;
    const overallAvgAfterBuys = overallQtyAfterBuys > 0 ? ((currentQty * currentAvg) + totalBuyCostWithFees) / overallQtyAfterBuys : 0;

    return { 
        buys: processedBuys, 
        sells: processedSells, 
        totalBuyQty, 
        totalBuyCostWithFees, 
        overallQtyAfterBuys, 
        overallAvgAfterBuys,
        totalProfit, 
        totalSellFees,
        finalRemainingQty,
        finalRemainingAvg,
        finalUnrealizedPL,
        currentUnrealizedPL
    };
  }, [buyPositions, sellPositions, activeHolding, broker]);

  const addBuyRow = () => {
    if (buyPositions.length < 10) {
      setBuyPositions([...buyPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: activeHolding?.currentPrice || 0 }]);
    }
  };

  const addSellRow = () => {
    if (sellPositions.length < 10) {
      setSellPositions([...sellPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: activeHolding?.currentPrice || 0, isIntraday: false }]);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
      
      {/* 1. HOLDING SELECTOR & TABLE (Stocks Page Style) */}
      <Card className="p-0 overflow-hidden border-slate-200 dark:border-slate-700 shadow-xl">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-4 w-full">
            <div className="w-full sm:w-1/3 min-w-[250px]">
              <select 
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                value={selectedTicker}
                onChange={(e) => {
                    setSelectedTicker(e.target.value);
                    setBuyPositions([]);
                    setSellPositions([]);
                }}
              >
                <option value="">Select holding to simulate...</option>
                {holdings.map(h => <option key={h.ticker} value={h.ticker}>{h.ticker} ({h.quantity} shares)</option>)}
              </select>
            </div>
          </div>
        </div>

        {activeHolding ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30">
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 font-semibold text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Avg Price</th>
                  <th className="px-4 py-3 font-semibold text-right">Current Price</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Cost</th>
                  <th className="px-4 py-3 font-semibold text-right">Market Value</th>
                  <th className="px-4 py-3 font-semibold text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                
                {/* CURRENT HOLDING */}
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div> Current Holding
                  </td>
                  <td className="px-4 py-4 text-right text-slate-700 dark:text-slate-300 font-medium">{activeHolding.quantity.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">{activeHolding.avgPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{activeHolding.currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">{(activeHolding.quantity * activeHolding.avgPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-slate-900 dark:text-slate-100 font-bold">{(activeHolding.quantity * activeHolding.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right">
                     <div className={`flex flex-col items-end ${analysis.currentUnrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        <span className="font-bold text-sm">{analysis.currentUnrealizedPL >= 0 ? '+' : ''}{analysis.currentUnrealizedPL.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                        <span className="text-[10px] opacity-80 font-mono flex items-center gap-0.5">
                            {analysis.currentUnrealizedPL >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {((activeHolding.quantity * activeHolding.avgPrice) > 0 ? ((analysis.currentUnrealizedPL / (activeHolding.quantity * activeHolding.avgPrice)) * 100) : 0).toFixed(2)}%
                        </span>
                     </div>
                  </td>
                </tr>

                {/* PROJECTED REMAINING */}
                <tr className="bg-indigo-50/40 dark:bg-indigo-900/20 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/40 transition-colors">
                  <td className="px-4 py-4 font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div> Projected Remaining
                  </td>
                  <td className="px-4 py-4 text-right text-indigo-700 dark:text-indigo-300 font-medium">{analysis.finalRemainingQty.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-indigo-600 dark:text-indigo-400">{analysis.finalRemainingAvg.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{activeHolding.currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-indigo-500 dark:text-indigo-400">{(analysis.finalRemainingQty * analysis.finalRemainingAvg).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-indigo-900 dark:text-indigo-100 font-bold">{(analysis.finalRemainingQty * activeHolding.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-4 text-right">
                     <div className={`flex flex-col items-end ${analysis.finalUnrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        <span className="font-bold text-sm">{analysis.finalUnrealizedPL >= 0 ? '+' : ''}{analysis.finalUnrealizedPL.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                        <span className="text-[10px] opacity-80 font-mono flex items-center gap-0.5">
                            {analysis.finalUnrealizedPL >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {((analysis.finalRemainingQty * analysis.finalRemainingAvg) > 0 ? ((analysis.finalUnrealizedPL / (analysis.finalRemainingQty * analysis.finalRemainingAvg)) * 100) : 0).toFixed(2)}%
                        </span>
                     </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-slate-400 flex flex-col items-center justify-center bg-white dark:bg-slate-900">
             <Activity size={48} className="opacity-20 mb-4" />
             <p>Select a stock from your holdings to view current status and begin simulation.</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* BUY SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
              <ArrowUpCircle size={18} /> Add Buy Positions
            </h3>
            <button onClick={addBuyRow} disabled={!activeHolding} className="p-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="space-y-2">
            {analysis.buys.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 shadow-sm">
                
                <div className="flex flex-col gap-1 w-full sm:flex-1">
                    <span className="text-[9px] text-slate-400 uppercase font-bold">Invest Amount</span>
                    <input 
                      type="number" 
                      placeholder="e.g. 50000"
                      className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500"
                      onChange={(e) => {
                          const amt = parseFloat(e.target.value) || 0;
                          if (amt > 0 && pos.price > 0) {
                              const qty = Math.floor(amt / (pos.price * 1.005)); 
                              const newPos = [...buyPositions];
                              newPos[idx].quantity = qty;
                              setBuyPositions(newPos);
                          }
                      }}
                    />
                </div>
                
                <div className="flex items-end gap-2 w-full sm:w-auto">
                    <div className="flex flex-col gap-1 w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Qty</span>
                        <input 
                          type="number" 
                          value={pos.quantity || ''}
                          onChange={(e) => {
                              const newPos = [...buyPositions];
                              newPos[idx].quantity = parseInt(e.target.value) || 0;
                              setBuyPositions(newPos);
                          }}
                          className="w-full p-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500 text-center"
                        />
                    </div>
                    <div className="flex flex-col gap-1 w-24">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Buy Price</span>
                        <input 
                          type="number" 
                          step="0.01"
                          value={pos.price || ''}
                          onChange={(e) => {
                              const newPos = [...buyPositions];
                              newPos[idx].price = parseFloat(e.target.value) || 0;
                              setBuyPositions(newPos);
                          }}
                          className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500 text-center"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Avg w/ Fees</span>
                        <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">Rs {(pos.avgBuy || 0).toFixed(2)}</span>
                    </div>
                    <button onClick={() => setBuyPositions(buyPositions.filter(p => p.id !== pos.id))} className="p-2 bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors">
                      <Trash2 size={14} />
                    </button>
                </div>
              </div>
            ))}
          </div>
          
          {buyPositions.length > 0 && (
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-2xl shadow-lg border border-emerald-400/50 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 opacity-10"><Calculator size={100} /></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-end mb-2 border-b border-emerald-400/30 pb-3">
                        <span className="text-sm font-bold uppercase tracking-wider text-emerald-100">Avg After Buys</span>
                        <span className="text-3xl font-black tracking-tight">Rs. {(analysis.overallAvgAfterBuys || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-emerald-50 pt-1">
                        <span>Total Shares: {(analysis.overallQtyAfterBuys || 0).toLocaleString()}</span>
                        <span>Extra Cost: Rs. {(analysis.totalBuyCostWithFees || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* SELL SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm">
              <ArrowDownCircle size={18} /> Add Sell Positions
            </h3>
            <button onClick={addSellRow} disabled={!activeHolding} className="p-1.5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 rounded-lg hover:bg-rose-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {analysis.sells.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-rose-500 shadow-sm">
                
                <div className="flex items-end gap-2 w-full sm:flex-1">
                    <div className="flex flex-col gap-1 flex-1 sm:w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Sell Qty</span>
                        <input 
                        type="number" 
                        value={pos.quantity || ''}
                        onChange={(e) => {
                            const newPos = [...sellPositions];
                            newPos[idx].quantity = parseInt(e.target.value) || 0;
                            setSellPositions(newPos);
                        }}
                        className="w-full p-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-rose-500 text-center"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1 sm:w-24">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Target Price</span>
                        <input 
                        type="number" 
                        step="0.01"
                        value={pos.price || ''}
                        onChange={(e) => {
                            const newPos = [...sellPositions];
                            newPos[idx].price = parseFloat(e.target.value) || 0;
                            setSellPositions(newPos);
                        }}
                        className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-rose-500 text-center"
                        />
                    </div>
                    <div className="flex flex-col gap-1 w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold text-center">Intraday</span>
                        <button 
                            onClick={() => {
                                const newPos = [...sellPositions];
                                newPos[idx].isIntraday = !newPos[idx].isIntraday;
                                setSellPositions(newPos);
                            }}
                            className={`w-full p-2 rounded-lg text-[10px] font-bold transition-all border ${pos.isIntraday ? 'bg-indigo-600 text-white border-indigo-700 shadow-inner' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600'}`}
                        >
                            {pos.isIntraday ? 'YES' : 'NO'}
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Est. Profit</span>
                        <span className={`text-xs font-bold font-mono ${pos.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {pos.profit >= 0 ? '+' : ''}{(pos.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <button onClick={() => setSellPositions(sellPositions.filter(p => p.id !== pos.id))} className="p-2 bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors">
                      <Trash2 size={14} />
                    </button>
                </div>
              </div>
            ))}
          </div>

          {sellPositions.length > 0 && (
            <div className="p-5 bg-slate-900 dark:bg-black text-white rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 opacity-10"><Activity size={100} /></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-end mb-2 border-b border-slate-700 pb-3">
                        <span className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Net Profit</span>
                        <span className={`text-3xl font-black tracking-tight ${analysis.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {analysis.totalProfit >= 0 ? '+' : ''}Rs. {(analysis.totalProfit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-slate-500 pt-1">
                        <span>Exit Fees: Rs. {(analysis.totalSellFees || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        <span>(FIFO Execution Used)</span>
                    </div>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* DETAILED LOG TABLE */}
      {(buyPositions.length > 0 || sellPositions.length > 0) && (
        <Card className="mt-8 p-0 overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
               <Activity size={16} className="text-blue-500" /> Execution Log Details
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="p-4">Action Type</th>
                  <th className="p-4 text-right">Quantity</th>
                  <th className="p-4 text-right">Price</th>
                  <th className="p-4 text-right text-slate-400">Taxes & Fees</th>
                  <th className="p-4 text-right">Per Share Avg / Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analysis.buys.map((r, i) => (
                    <tr key={`buy-${r.id}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4">
                        <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-black px-2 py-1 rounded text-[10px] border border-emerald-100 dark:border-emerald-800">
                           BUY 
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-700 dark:text-slate-300">{(r.quantity || 0).toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-400">{(r.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td className="p-4 text-right font-mono text-xs text-slate-400">{(r.fees || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                      <td className="p-4 text-right">
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Avg: {(r.avgBuy || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                      </td>
                    </tr>
                ))}
                {analysis.sells.map((r, i) => (
                    <tr key={`sell-${r.id}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 flex items-center gap-2">
                        <span className="bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-black px-2 py-1 rounded text-[10px] border border-rose-100 dark:border-rose-800">
                           SELL
                        </span>
                        {r.isIntraday && r.filledIntraday > 0 && <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase">Intraday</span>}
                      </td>
                      <td className="p-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {(r.quantity || 0).toLocaleString()} 
                          {r.unfilled > 0 && <span className="block text-rose-500 text-[9px] font-bold mt-0.5" title="Short sale (insufficient holdings)">Unfilled: {r.unfilled}</span>}
                          {r.isIntraday && r.filledStandard > 0 && <span className="block text-orange-500 text-[9px] font-bold mt-0.5" title="Standard fees applied to this portion">FIFO Used: {r.filledStandard}</span>}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-400">{(r.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td className="p-4 text-right font-mono text-xs text-slate-400">{(r.fees || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                      <td className="p-4 text-right">
                          <span className={`font-mono text-xs font-bold ${r.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              P&L: {r.profit > 0 ? '+' : ''}{(r.profit || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </span>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* FOOTER INFO MESSAGE */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-start gap-3 text-xs text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50">
          <Info size={18} className="shrink-0 mt-0.5 opacity-80" />
          <div className="space-y-1 opacity-90 leading-relaxed">
             <p>This simulator accurately applies the <strong>{broker?.name || 'Default'}</strong> fee structure.</p>
             <p>Sales are calculated using strict <strong>FIFO</strong> (First-In, First-Out) logic. <em>Intraday</em> sales bypass exit fees ONLY for the portion that matches the simulated buys added above. If the sell quantity exceeds the new buys, the remainder draws from existing holdings and incurs standard exit fees.</p>
          </div>
      </div>
    </div>
  );
};
