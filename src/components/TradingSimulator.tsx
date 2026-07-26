import React, { useState, useMemo } from 'react';
import { Holding, Broker, Transaction } from '../types';
import { 
  Plus, 
  Trash2, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Info, 
  Activity, 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Crosshair, 
  PieChart, 
  LineChart,
  CheckSquare,
  History
} from 'lucide-react';

interface TradingSimulatorProps {
  holdings: Holding[];
  brokers: Broker[];
  defaultBrokerId: string;
  transactions?: Transaction[]; 
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

export const TradingSimulator: React.FC<TradingSimulatorProps> = ({ holdings, brokers, defaultBrokerId, transactions = [] }) => {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [buyPositions, setBuyPositions] = useState<SimBuy[]>([]);
  const [sellPositions, setSellPositions] = useState<SimSell[]>([]);
  const [customTargetPrice, setCustomTargetPrice] = useState<number | ''>('');

  const activeHolding = holdings.find(h => h.ticker === selectedTicker);
  const broker = brokers.find(b => b.id === defaultBrokerId) || brokers[0] || {} as Broker;

  const targetPrice = customTargetPrice !== '' ? Number(customTargetPrice) : (activeHolding?.currentPrice || 0);

  const calculateFees = (price: number, qty: number) => {
    if (!price || !qty || !broker || !broker.commissionType) return { total: 0 };
    const amount = price * qty;
    let commission = 0;
    
    const cType = broker.commissionType || 'PERCENTAGE';
    const r1 = broker.rate1 || 0.15;
    const r2 = broker.rate2 || 0.05;
    
    if (cType === 'PERCENTAGE' || (cType as any) === 'PERCENT') commission = amount * (r1 / 100);
    else if (cType === 'PER_SHARE') commission = qty * r1;
    else if (cType === 'FIXED') commission = r1;
    else if (cType === 'SLAB') commission = amount * (r1 / 100); 
    else commission = Math.max(qty * r2, amount * (r1 / 100));
    
    const sst = commission * ((broker.sstRate || 15) / 100);
    const cdcType = broker.cdcType || 'PER_SHARE';
    let cdc = 0;
    
    if (cdcType === 'PER_SHARE') cdc = qty * (broker.cdcRate !== undefined ? broker.cdcRate : 0.005);
    else if (cdcType === 'FIXED') cdc = broker.cdcRate || 0;
    else cdc = Math.max(qty * (broker.cdcRate || 0.005), broker.cdcMin || 0);

    return { total: commission + sst + cdc };
  };

  const historicalState = useMemo(() => {
    if (!selectedTicker) return { openLots: [], historicalRealizedPL: 0 };
    
    if (!transactions || transactions.length === 0) {
        if (activeHolding) return {
            openLots: [{ id: 'base', date: 'Aggregate', quantity: activeHolding.quantity, price: activeHolding.avgPrice, costPerShare: activeHolding.avgPrice }],
            historicalRealizedPL: 0
        };
        return { openLots: [], historicalRealizedPL: 0 };
    }

    const txs = transactions.filter(t => t.ticker === selectedTicker).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const txsByDate: Record<string, Transaction[]> = {};
    txs.forEach(t => { if (!txsByDate[t.date]) txsByDate[t.date] = []; txsByDate[t.date].push(t); });

    const sortedDates = Object.keys(txsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const lots: { id: string, date: string, quantity: number, price: number, costPerShare: number }[] = [];
    let histRealized = 0;

    sortedDates.forEach(date => {
        const dayTxs = txsByDate[date];
        const dayBuys = dayTxs.filter(t => t.type === 'BUY' || t.type === 'TRANSFER_IN');
        const daySells = dayTxs.filter(t => t.type === 'SELL' || t.type === 'TRANSFER_OUT');

        const dayBuyLots = dayBuys.map(t => {
            const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
            return { id: t.id, date: t.date, quantity: t.quantity, price: t.price, costPerShare: t.quantity > 0 ? ((t.quantity * t.price) + fees) / t.quantity : 0 };
        });

        daySells.forEach(sellTx => {
            let qtyToSell = sellTx.quantity;
            const sellFees = (sellTx.commission || 0) + (sellTx.tax || 0) + (sellTx.cdcCharges || 0) + (sellTx.otherFees || 0);
            const netProceeds = (sellTx.quantity * sellTx.price) - sellFees;
            let costBasis = 0;

            for (const buyLot of dayBuyLots) {
                if (qtyToSell <= 0.0001) break;
                if (buyLot.quantity > 0) { 
                    const match = Math.min(qtyToSell, buyLot.quantity); 
                    costBasis += match * buyLot.costPerShare;
                    buyLot.quantity -= match; 
                    qtyToSell -= match; 
                }
            }
            while (qtyToSell > 0.0001 && lots.length > 0) {
                const fifoLot = lots[0];
                const match = Math.min(qtyToSell, fifoLot.quantity);
                costBasis += match * fifoLot.costPerShare;
                fifoLot.quantity -= match; 
                qtyToSell -= match;
                if (fifoLot.quantity < 0.0001) lots.shift();
            }

            histRealized += (netProceeds - costBasis);
        });

        // Include any manual PnL adjustments or CGT taxes stored in history
        dayTxs.filter(t => t.type === 'HISTORY').forEach(t => histRealized += t.price);
        dayTxs.filter(t => t.type === 'TAX').forEach(t => histRealized -= t.price);

        dayBuyLots.forEach(l => { if (l.quantity > 0.0001) lots.push(l); });
    });

    return { openLots: lots, historicalRealizedPL: histRealized };
  }, [selectedTicker, transactions, activeHolding]);

  const analysis = useMemo(() => {
    let totalBuyQty = 0;
    let totalBuyCostWithFees = 0;
    
    const processedBuys = buyPositions.map(p => {
        const fees = calculateFees(p.price, p.quantity);
        const cost = (p.price * p.quantity) + fees.total;
        const avgBuy = p.quantity > 0 ? cost / p.quantity : 0;
        totalBuyQty += p.quantity; totalBuyCostWithFees += cost;
        return { ...p, fees: fees.total, totalCost: cost, avgBuy };
    });

    let pool = historicalState.openLots.map(l => ({ ...l }));
    const newBuyLots = processedBuys.map(r => ({ id: r.id, qty: r.quantity, cost: r.avgBuy }));
    
    let totalProfit = 0;
    let totalSellFees = 0;

    const processedSells = sellPositions.map(p => {
        let qtyToFill = p.quantity;
        let costBasis = 0;
        let filledIntraday = 0;
        let filledStandard = 0;

        if (p.isIntraday) {
            for (const lot of newBuyLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty); costBasis += match * lot.cost; lot.qty -= match; qtyToFill -= match; filledIntraday += match;
            }
            for (const lot of pool) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.quantity); costBasis += match * lot.costPerShare; lot.quantity -= match; qtyToFill -= match; filledStandard += match;
            }
        } else {
            for (const lot of pool) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.quantity); costBasis += match * lot.costPerShare; lot.quantity -= match; qtyToFill -= match; filledStandard += match;
            }
            for (const lot of newBuyLots) {
                if (qtyToFill <= 0) break;
                const match = Math.min(qtyToFill, lot.qty); costBasis += match * lot.cost; lot.qty -= match; qtyToFill -= match; filledStandard += match;
            }
        }

        const sellFees = calculateFees(p.price, filledStandard).total;
        const netRevenue = (p.quantity * p.price) - sellFees;
        const profit = netRevenue - costBasis;
        totalProfit += profit; totalSellFees += sellFees;

        return { ...p, fees: sellFees, netRevenue, costBasis, profit, unfilled: qtyToFill, filledIntraday, filledStandard };
    });

    const remainingHistoricalQty = pool.reduce((acc, l) => acc + l.quantity, 0);
    const remainingHistoricalCost = pool.reduce((acc, l) => acc + (l.quantity * l.costPerShare), 0);
    
    let finalRemainingQty = remainingHistoricalQty;
    let finalRemainingCost = remainingHistoricalCost;
    
    newBuyLots.filter(l => l.qty > 0).forEach(l => {
        finalRemainingQty += l.qty; finalRemainingCost += (l.qty * l.cost);
    });

    const finalRemainingAvg = finalRemainingQty > 0 ? finalRemainingCost / finalRemainingQty : 0;
    
    // Projected Unrealized P&L (WITH EXIT FEES DEDUCTED)
    const finalExitFees = calculateFees(targetPrice, finalRemainingQty).total;
    const finalUnrealizedPL = finalRemainingQty > 0 ? (finalRemainingQty * targetPrice) - finalRemainingCost - finalExitFees : 0;
    
    const currentExitFees = calculateFees(targetPrice, activeHolding?.quantity || 0).total;
    const currentUnrealizedPL = (activeHolding?.quantity || 0) > 0 ? ((activeHolding?.quantity || 0) * targetPrice) - ((activeHolding?.quantity || 0) * (activeHolding?.avgPrice || 0)) - currentExitFees : 0;
    
    const overallQtyAfterBuys = (activeHolding?.quantity || 0) + totalBuyQty;
    const overallAvgAfterBuys = overallQtyAfterBuys > 0 ? (((activeHolding?.quantity || 0) * (activeHolding?.avgPrice || 0)) + totalBuyCostWithFees) / overallQtyAfterBuys : 0;

    // Absolute Lifetime Net
    const totalLifetimeNet = historicalState.historicalRealizedPL + totalProfit + finalUnrealizedPL;

    return { 
        buys: processedBuys, sells: processedSells, totalBuyQty, totalBuyCostWithFees, 
        overallQtyAfterBuys, overallAvgAfterBuys,
        totalProfit, totalSellFees, finalRemainingQty, finalRemainingAvg, finalUnrealizedPL, currentUnrealizedPL,
        finalExitFees, currentExitFees, totalLifetimeNet
    };
  }, [buyPositions, sellPositions, activeHolding, broker, historicalState, targetPrice]);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
      
      {/* HEADER: SELECTOR & TARGET PRICE */}
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark transition-all">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="w-full md:w-1/3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Select Stock</label>
            <div className="relative">
              <select 
                className="w-full pl-4 pr-10 py-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm appearance-none cursor-pointer transition-all"
                value={selectedTicker}
                onChange={(e) => { setSelectedTicker(e.target.value); setBuyPositions([]); setSellPositions([]); setCustomTargetPrice(''); }}
              >
                <option value="">Choose a stock...</option>
                {holdings.map(h => <option key={h.ticker} value={h.ticker}>{h.ticker} ({h.quantity} shs)</option>)}
              </select>
              <div className="absolute right-4 top-4 text-slate-400 pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>
          
          {activeHolding && (
              <div className="flex flex-1 items-center gap-5 justify-end">
                  <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Current Market Price</p>
                      <p className="font-mono text-xl font-black text-slate-900 dark:text-white tabular-nums">Rs. {activeHolding.currentPrice.toFixed(2)}</p>
                  </div>
                  <div className="h-10 w-px bg-slate-200/60 dark:bg-slate-700/60 hidden sm:block"></div>
                  <div className="w-full sm:w-56 relative">
                      <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 ml-1">
                          <Crosshair size={14}/> Simulation Target
                      </label>
                      <input 
                          type="number" 
                          step="any"
                          placeholder={activeHolding.currentPrice.toString()}
                          value={customTargetPrice}
                          onChange={(e) => setCustomTargetPrice(e.target.value)}
                          className="w-full px-4 py-3.5 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-black font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm transition-all"
                      />
                  </div>
              </div>
          )}
        </div>
      </div>

      {/* OPEN LOTS BREAKDOWN (HOLDINGS TABLE STYLE) */}
      {activeHolding && historicalState.openLots.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark">
              <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 bg-white dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm border border-blue-100 dark:border-blue-500/20">
                          <PieChart size={20} />
                      </div>
                      <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Current Holdings Breakdown (FIFO)</h3>
                  </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-[900px] border-collapse">
                      <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-widest border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                          <tr>
                              <th className="px-6 py-3.5">Buy Date</th>
                              <th className="px-6 py-3.5 text-right">Quantity</th>
                              <th className="px-6 py-3.5 text-right">Avg Cost</th>
                              <th className="px-6 py-3.5 text-right">Total Cost</th>
                              <th className="px-6 py-3.5 text-right">Value (@ Target)</th>
                              <th className="px-6 py-3.5 text-right">Net P&L (After Exit Fees)</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {historicalState.openLots.map((lot, idx) => {
                              const cost = lot.quantity * lot.costPerShare;
                              const value = lot.quantity * targetPrice;
                              const exitFees = calculateFees(targetPrice, lot.quantity).total;
                              const pnl = value - cost - exitFees;
                              return (
                                  <tr key={lot.id + idx} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group">
                                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs tabular-nums">{lot.date}</td>
                                      <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{lot.quantity.toLocaleString()}</td>
                                      <td className="px-6 py-3.5 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{lot.costPerShare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                      <td className="px-6 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">{cost.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                      <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">{value.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                      <td className="px-6 py-3.5 text-right">
                                          <div className={`font-mono font-bold tabular-nums text-sm ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                          </div>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                      <tfoot className="bg-slate-50/90 dark:bg-slate-800/90 border-t-2 border-slate-200 dark:border-slate-700 text-sm font-bold shadow-inner">
                          <tr>
                              <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest">Aggregate Total</td>
                              <td className="px-6 py-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{activeHolding.quantity.toLocaleString()}</td>
                              <td className="px-6 py-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">{activeHolding.avgPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              <td className="px-6 py-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">{(activeHolding.quantity * activeHolding.avgPrice).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                              <td className="px-6 py-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{(activeHolding.quantity * targetPrice).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                              <td className={`px-6 py-4 text-right font-mono tabular-nums text-base ${analysis.currentUnrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {analysis.currentUnrealizedPL >= 0 ? '+' : ''}{analysis.currentUnrealizedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </div>
      )}

      {/* SIMULATOR GRIDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* BUY SECTION */}
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-card dark:shadow-card-dark space-y-5">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <h3 className="font-display font-black flex items-center gap-3 text-emerald-600 dark:text-emerald-400 text-lg">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                <ArrowUpCircle size={20} />
              </div> 
              Add Buy Positions
            </h3>
            <button onClick={() => {
                if (buyPositions.length < 10) setBuyPositions([...buyPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: targetPrice }]);
            }} disabled={!activeHolding} className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:-translate-y-0.5 active:translate-y-0">
              <Plus size={18} />
            </button>
          </div>
          
          <div className="space-y-3">
            {analysis.buys.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 border-l-4 border-l-emerald-500 shadow-sm transition-all hover:shadow-md">
                <div className="flex flex-col gap-1.5 w-full sm:flex-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest ml-1">Invest Amount</span>
                    <input type="number" placeholder="e.g. 50000" className="w-full px-4 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm transition-all" onChange={(e) => { const amt = parseFloat(e.target.value) || 0; if (amt > 0 && pos.price > 0) { const qty = Math.floor(amt / (pos.price * 1.005)); const newPos = [...buyPositions]; newPos[idx].quantity = qty; setBuyPositions(newPos); } }} />
                </div>
                <div className="flex items-end gap-3 w-full sm:w-auto">
                    <div className="flex flex-col gap-1.5 w-24">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest ml-1 text-center">Qty</span>
                        <input type="number" value={pos.quantity || ''} onChange={(e) => { const newPos = [...buyPositions]; newPos[idx].quantity = parseInt(e.target.value) || 0; setBuyPositions(newPos); }} className="w-full px-3 py-2.5 text-sm font-mono font-bold tabular-nums bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center shadow-sm transition-all" />
                    </div>
                    <div className="flex flex-col gap-1.5 w-28">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest ml-1 text-center">Buy Price</span>
                        <input type="number" step="any" value={pos.price || ''} onChange={(e) => { const newPos = [...buyPositions]; newPos[idx].price = parseFloat(e.target.value) || 0; setBuyPositions(newPos); }} className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center shadow-sm transition-all" />
                    </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex flex-col text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Avg w/ Fees</span>
                        <span className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">Rs. {(pos.avgBuy || 0).toFixed(2)}</span>
                    </div>
                    <button onClick={() => setBuyPositions(buyPositions.filter(p => p.id !== pos.id))} className="p-2.5 bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all border border-rose-100/60 dark:border-rose-500/20 shadow-sm hover:-translate-y-0.5"> <Trash2 size={16} /> </button>
                </div>
              </div>
            ))}
            {buyPositions.length === 0 && (
                <div className="p-6 text-center text-slate-400 dark:text-slate-500 font-medium text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">No simulated buy positions added.</div>
            )}
          </div>
        </div>

        {/* SELL SECTION */}
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-card dark:shadow-card-dark space-y-5">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <h3 className="font-display font-black flex items-center gap-3 text-rose-600 dark:text-rose-400 text-lg">
              <div className="p-2 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
                <ArrowDownCircle size={20} />
              </div> 
              Add Sell Positions
            </h3>
            <button onClick={() => {
                if (sellPositions.length < 10) setSellPositions([...sellPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: targetPrice, isIntraday: false }]);
            }} disabled={!activeHolding} className="p-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:-translate-y-0.5 active:translate-y-0">
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-3">
            {analysis.sells.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 border-l-4 border-l-rose-500 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-end gap-3 w-full sm:flex-1">
                    <div className="flex flex-col gap-1.5 flex-1 sm:w-24">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest ml-1 text-center">Sell Qty</span>
                        <input type="number" value={pos.quantity || ''} onChange={(e) => { const newPos = [...sellPositions]; newPos[idx].quantity = parseInt(e.target.value) || 0; setSellPositions(newPos); }} className="w-full px-3 py-2.5 text-sm font-mono font-bold tabular-nums bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-center shadow-sm transition-all" />
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 sm:w-28">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest ml-1 text-center">Target Price</span>
                        <input type="number" step="any" value={pos.price || ''} onChange={(e) => { const newPos = [...sellPositions]; newPos[idx].price = parseFloat(e.target.value) || 0; setSellPositions(newPos); }} className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-center shadow-sm transition-all" />
                    </div>
                    <div className="flex flex-col gap-1.5 w-20">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest text-center">Intraday</span>
                        <button onClick={() => { const newPos = [...sellPositions]; newPos[idx].isIntraday = !newPos[idx].isIntraday; setSellPositions(newPos); }} className={`w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest transition-all border shadow-sm ${pos.isIntraday ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200/80 dark:border-slate-700/60'}`}> {pos.isIntraday ? 'YES' : 'NO'} </button>
                    </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex flex-col text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Est. Realized</span>
                        <span className={`text-sm font-bold font-mono tabular-nums ${pos.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {pos.profit >= 0 ? '+' : ''}{(pos.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} </span>
                    </div>
                    <button onClick={() => setSellPositions(sellPositions.filter(p => p.id !== pos.id))} className="p-2.5 bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all border border-rose-100/60 dark:border-rose-500/20 shadow-sm hover:-translate-y-0.5"> <Trash2 size={16} /> </button>
                </div>
              </div>
            ))}
            {sellPositions.length === 0 && (
                <div className="p-6 text-center text-slate-400 dark:text-slate-500 font-medium text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">No simulated sell positions added.</div>
            )}
          </div>
        </div>
      </div>

      {/* OVERALL ABSOLUTE SUMMARY CARD */}
      {activeHolding && (
          <div className="rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark bg-gradient-to-br from-indigo-500/5 to-purple-500/5 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200/50 dark:border-indigo-800/50 mt-8">
              <div className="p-5 bg-indigo-600 dark:bg-indigo-900/60 border-b border-indigo-500 dark:border-indigo-800/80 flex items-center gap-3 text-white">
                  <div className="p-2 bg-white/20 rounded-xl">
                      <LineChart size={20} />
                  </div>
                  <h3 className="font-display font-black text-lg tracking-wide uppercase">Simulation Results & Lifetime Outcome</h3>
              </div>
              
              <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* COLUMN 1: INTERMEDIATE STATE (AFTER BUYS) */}
                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                      <h4 className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-widest mb-4 flex items-center gap-2"><ArrowUpCircle size={16} className="text-emerald-500"/> State After Simulated Buys</h4>
                      <div className="flex justify-between items-end mb-3">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Shares</span>
                          <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100 tabular-nums">{analysis.overallQtyAfterBuys.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-end">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">New Average Price</span>
                          <span className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">Rs. {analysis.overallAvgAfterBuys.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                  </div>

                  {/* COLUMN 2: FINAL STATE (AFTER SELLS) */}
                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                      <h4 className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-widest mb-4 flex items-center gap-2"><ArrowDownCircle size={16} className="text-rose-500"/> Final Remaining State</h4>
                      <div className="flex justify-between items-end mb-3">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Remaining Shares</span>
                          <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100 tabular-nums">{analysis.finalRemainingQty.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-end mb-4">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Remaining Avg Price</span>
                          <span className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400 tabular-nums">Rs. {analysis.finalRemainingAvg.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                      <div className="flex justify-between items-end pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">Projected Unrealized<br/>(At Target Price)</span>
                          <span className={`font-mono font-bold text-lg tabular-nums ${analysis.finalUnrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {analysis.finalUnrealizedPL >= 0 ? '+' : ''}{analysis.finalUnrealizedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </span>
                      </div>
                  </div>

                  {/* COLUMN 3: LIFETIME P&L */}
                  <div className="bg-indigo-50/80 dark:bg-indigo-500/10 backdrop-blur-md p-6 rounded-2xl border border-indigo-200/60 dark:border-indigo-500/20 shadow-sm relative flex flex-col">
                      <h4 className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-widest mb-5 flex items-center gap-2"><Calculator size={16}/> Total Absolute P&L</h4>
                      
                      <div className="space-y-3 mb-5 flex-1">
                          <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-500 dark:text-slate-400">Past Realized</span>
                              <span className={`font-mono tabular-nums ${historicalState.historicalRealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {historicalState.historicalRealizedPL >= 0 ? '+' : ''}{historicalState.historicalRealizedPL.toLocaleString(undefined, {maximumFractionDigits:0})}
                              </span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-500 dark:text-slate-400">Simulated Realized</span>
                              <span className={`font-mono tabular-nums ${analysis.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {analysis.totalProfit >= 0 ? '+' : ''}{analysis.totalProfit.toLocaleString(undefined, {maximumFractionDigits:0})}
                              </span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-500 dark:text-slate-400">Projected Unrealized</span>
                              <span className={`font-mono tabular-nums ${analysis.finalUnrealizedPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {analysis.finalUnrealizedPL >= 0 ? '+' : ''}{analysis.finalUnrealizedPL.toLocaleString(undefined, {maximumFractionDigits:0})}
                              </span>
                          </div>
                      </div>

                      <div className="border-t border-indigo-200/60 dark:border-indigo-500/20 pt-4 flex justify-between items-end mt-auto">
                          <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 uppercase tracking-widest">Overall Net</span>
                          <span className={`text-3xl font-display font-black tabular-nums tracking-tight ${analysis.totalLifetimeNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {analysis.totalLifetimeNet >= 0 ? '+' : ''}{analysis.totalLifetimeNet.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </span>
                      </div>
                  </div>

              </div>
          </div>
      )}

    </div>
  );
};
