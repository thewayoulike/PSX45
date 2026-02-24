import React, { useState, useMemo } from 'react';
import { Holding, Broker } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Info, Activity } from 'lucide-react';

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
  const broker = brokers.find(b => b.id === defaultBrokerId) || brokers[0];

  const calculateFees = (price: number, qty: number) => {
    if (!price || !qty) return { total: 0 };
    const amount = price * qty;
    let commission = 0;
    
    // Safety check for commission type since it might be stored as 'PERCENT' instead of 'PERCENTAGE'
    if (broker.commissionType === 'PERCENTAGE' || (broker.commissionType as any) === 'PERCENT') {
      commission = amount * ((broker.rate1 || 0.15) / 100);
    } else if (broker.commissionType === 'PER_SHARE') {
      commission = qty * broker.rate1;
    } else if (broker.commissionType === 'FIXED') {
      commission = broker.rate1;
    } else if (broker.commissionType === 'SLAB') {
      // Fallback rough estimate for slabs
      commission = amount * ((broker.rate1 || 0.15) / 100); 
    } else {
      const perShare = qty * (broker.rate2 || 0.05);
      const percentage = amount * ((broker.rate1 || 0.15) / 100);
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

  const buyAnalysis = useMemo(() => {
    let totalQty = 0;
    let totalCostWithFees = 0;
    
    const rows = buyPositions.map(p => {
        const fees = calculateFees(p.price, p.quantity);
        const cost = (p.price * p.quantity) + fees.total;
        const avgBuy = p.quantity > 0 ? cost / p.quantity : 0;
        totalQty += p.quantity;
        totalCostWithFees += cost;
        return { ...p, fees: fees.total, totalCost: cost, avgBuy };
    });

    const currentQty = activeHolding?.quantity || 0;
    const currentCost = currentQty * (activeHolding?.avgPrice || 0);
    const overallQty = currentQty + totalQty;
    const overallAvg = overallQty > 0 ? (currentCost + totalCostWithFees) / overallQty : 0;

    return { rows, totalQty, totalCostWithFees, overallQty, overallAvg };
  }, [buyPositions, activeHolding, broker]);

  const sellAnalysis = useMemo(() => {
    let totalProfit = 0;
    let totalSellFees = 0;

    // Deep copy intraday lots from the buy simulation
    const intradayLots = buyAnalysis.rows.map(r => ({ id: r.id, qty: r.quantity, cost: r.avgBuy })).filter(r => r.qty > 0);
    
    let historicalQty = activeHolding?.quantity || 0;
    const historicalCost = activeHolding?.avgPrice || 0;

    const rows = sellPositions.map(p => {
        // As per requirements: Intraday sales carry zero exit fees
        const fees = p.isIntraday ? { total: 0 } : calculateFees(p.price, p.quantity);
        const netRevenue = (p.quantity * p.price) - fees.total;
        
        let qtyToFill = p.quantity;
        let costBasis = 0;

        if (p.isIntraday) {
            // Intraday Priority: Consume simulated today's buys first
            for (const lot of intradayLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty);
                costBasis += match * lot.cost;
                lot.qty -= match;
                qtyToFill -= match;
            }
            // If still short, consume historical
            if (qtyToFill > 0 && historicalQty > 0) {
                const match = Math.min(qtyToFill, historicalQty);
                costBasis += match * historicalCost;
                historicalQty -= match;
                qtyToFill -= match;
            }
        } else {
            // Standard FIFO Priority: Consume historical holds first
            if (qtyToFill > 0 && historicalQty > 0) {
                const match = Math.min(qtyToFill, historicalQty);
                costBasis += match * historicalCost;
                historicalQty -= match;
                qtyToFill -= match;
            }
            // If still short, consume today's buys
            for (const lot of intradayLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty);
                costBasis += match * lot.cost;
                lot.qty -= match;
                qtyToFill -= match;
            }
        }

        const profit = netRevenue - costBasis; 
        totalProfit += profit;
        totalSellFees += fees.total;

        return { ...p, fees: fees.total, netRevenue, costBasis, profit, unfilled: qtyToFill };
    });

    return { rows, totalProfit, totalSellFees };
  }, [sellPositions, buyAnalysis, activeHolding, broker]);

  const addBuyRow = () => {
    if (buyPositions.length < 10) {
      setBuyPositions([...buyPositions, { id: Date.now().toString(), quantity: 0, price: activeHolding?.currentPrice || 0 }]);
    }
  };

  const addSellRow = () => {
    if (sellPositions.length < 10) {
      setSellPositions([...sellPositions, { id: Date.now().toString(), quantity: 0, price: activeHolding?.currentPrice || 0, isIntraday: false }]);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
      
      {/* 1. HOLDING SELECTOR */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="w-full md:w-1/3">
            <label className="block text-sm font-bold text-slate-500 mb-2">Select Stock</label>
            <select 
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              value={selectedTicker}
              onChange={(e) => {
                  setSelectedTicker(e.target.value);
                  setBuyPositions([]);
                  setSellPositions([]);
              }}
            >
              <option value="">Choose a stock...</option>
              {holdings.map(h => <option key={h.ticker} value={h.ticker}>{h.ticker}</option>)}
            </select>
          </div>
          
          {activeHolding ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 w-full">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Current Qty</p>
                <p className="font-black text-slate-800 dark:text-slate-200">{activeHolding.quantity.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Current Avg</p>
                <p className="font-black text-slate-800 dark:text-slate-200 font-mono">Rs. {activeHolding.avgPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Market Price</p>
                <p className="font-black text-emerald-600 dark:text-emerald-400 font-mono">Rs. {activeHolding.currentPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Exit Break-even</p>
                <p className="font-black text-emerald-700 dark:text-emerald-300 font-mono">Rs. {(activeHolding.avgPrice * 1.005).toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full flex items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
               Select an existing holding to start simulation.
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ======================= */}
        {/* BUY SECTION (Averaging) */}
        {/* ======================= */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
              <ArrowUpCircle size={18} /> Buy Simulator
            </h3>
            <button onClick={addBuyRow} disabled={!activeHolding} className="p-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="space-y-2">
            {buyAnalysis.rows.map((pos, idx) => (
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
                              // Rough calculation deducting estimated 0.5% fees
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
                        <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">Rs {pos.avgBuy.toFixed(2)}</span>
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
                        <span className="text-sm font-bold uppercase tracking-wider text-emerald-100">New Overall Avg</span>
                        <span className="text-3xl font-black tracking-tight">Rs. {buyAnalysis.overallAvg.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-emerald-50 pt-1">
                        <span>Total Shares: {buyAnalysis.overallQty.toLocaleString()}</span>
                        <span>Extra Cost: Rs. {buyAnalysis.totalCostWithFees.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* ======================= */}
        {/* SELL SECTION (Exit)     */}
        {/* ======================= */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm">
              <ArrowDownCircle size={18} /> Sell Simulator
            </h3>
            <button onClick={addSellRow} disabled={!activeHolding} className="p-1.5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 rounded-lg hover:bg-rose-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {sellAnalysis.rows.map((pos, idx) => (
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
                        {pos.profit >= 0 ? '+' : ''}{pos.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                        <span className={`text-3xl font-black tracking-tight ${sellAnalysis.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {sellAnalysis.totalProfit >= 0 ? '+' : ''}Rs. {sellAnalysis.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-slate-500 pt-1">
                        <span>Exit Fees: Rs. {sellAnalysis.totalSellFees.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        <span>(FIFO Execution Used)</span>
                    </div>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================= */}
      {/* DETAILED LOG TABLE      */}
      {/* ======================= */}
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
                {buyAnalysis.rows.map((r, i) => (
                    <tr key={`buy-${r.id}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4">
                        <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-black px-2 py-1 rounded text-[10px] border border-emerald-100 dark:border-emerald-800">
                           BUY 
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-700 dark:text-slate-300">{r.quantity.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-400">{r.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td className="p-4 text-right font-mono text-xs text-slate-400">{r.fees.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                      <td className="p-4 text-right">
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Avg: {r.avgBuy.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                      </td>
                    </tr>
                ))}
                {sellAnalysis.rows.map((r, i) => (
                    <tr key={`sell-${r.id}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 flex items-center gap-2">
                        <span className="bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-black px-2 py-1 rounded text-[10px] border border-rose-100 dark:border-rose-800">
                           SELL
                        </span>
                        {r.isIntraday && <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase">Intraday</span>}
                      </td>
                      <td className="p-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {r.quantity.toLocaleString()} 
                          {r.unfilled > 0 && <span className="block text-rose-500 text-[9px] font-bold mt-0.5" title="Short sale (insufficient holdings)">Unfilled: {r.unfilled}</span>}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-400">{r.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td className="p-4 text-right font-mono text-xs text-slate-400">{r.fees.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                      <td className="p-4 text-right">
                          <span className={`font-mono text-xs font-bold ${r.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              P&L: {r.profit > 0 ? '+' : ''}{r.profit.toLocaleString(undefined, {maximumFractionDigits: 0})}
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
             <p>This simulator accurately applies the <strong>{broker.name}</strong> fee structure.</p>
             <p>Sales are calculated using strict <strong>FIFO</strong> (First-In, First-Out) logic against your current average cost. <em>Intraday</em> sales bypass exit fees and automatically match against the simulated buys added above.</p>
          </div>
      </div>
    </div>
  );
};
