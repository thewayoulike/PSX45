// src/components/TradingSimulator.tsx
import React, { useState, useMemo } from 'react';
import { Holding, Broker, Transaction } from '../types';
import { Card } from './ui/Card';
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
    
    // Absolute Lifetime Net
    const totalLifetimeNet = historicalState.historicalRealizedPL + totalProfit + finalUnrealizedPL;

    return { 
        buys: processedBuys, sells: processedSells, totalBuyQty, totalBuyCostWithFees, 
        totalProfit, totalSellFees, finalRemainingQty, finalRemainingAvg, finalUnrealizedPL, currentUnrealizedPL,
        finalExitFees, currentExitFees, totalLifetimeNet
    };
  }, [buyPositions, sellPositions, activeHolding, broker, historicalState, targetPrice]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
      
      {/* HEADER: SELECTOR & TARGET PRICE */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="w-full md:w-1/3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Stock</label>
            <select 
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              value={selectedTicker}
              onChange={(e) => { setSelectedTicker(e.target.value); setBuyPositions([]); setSellPositions([]); setCustomTargetPrice(''); }}
            >
              <option value="">Choose a stock...</option>
              {holdings.map(h => <option key={h.ticker} value={h.ticker}>{h.ticker} ({h.quantity} shs)</option>)}
            </select>
          </div>
          
          {activeHolding && (
              <div className="flex flex-1 items-center gap-4 justify-end">
                  <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Market Price</p>
                      <p className="font-mono text-xl font-medium text-slate-700 dark:text-slate-300">Rs. {activeHolding.currentPrice.toFixed(2)}</p>
                  </div>
                  <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
                  <div className="w-full sm:w-48 relative">
                      <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Crosshair size={12}/> Simulation Target Price
                      </label>
                      <input 
                          type="number" 
                          placeholder={activeHolding.currentPrice.toString()}
                          value={customTargetPrice}
                          onChange={(e) => setCustomTargetPrice(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 font-black font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                  </div>
              </div>
          )}
        </div>
      </Card>

      {/* OPEN LOTS BREAKDOWN */}
      {activeHolding && historicalState.openLots.length > 0 && (
          <Card className="p-0 overflow-hidden border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                      <PieChart size={16} className="text-blue-500" /> Current Holdings Breakdown (FIFO Lots)
                  </h3>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                      <thead>
                          <tr className="bg-white dark:bg-slate-900 text-[10px] uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                              <th className="p-4 font-semibold">Buy Date</th>
                              <th className="p-4 font-semibold text-right">Quantity</th>
                              <th className="p-4 font-semibold text-right">Avg Cost</th>
                              <th className="p-4 font-semibold text-right">Total Cost</th>
                              <th className="p-4 font-semibold text-right">Value (@ Target)</th>
                              <th className="p-4 font-semibold text-right">Net P&L (After Exit Fees)</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                          {historicalState.openLots.map((lot, idx) => {
                              const cost = lot.quantity * lot.costPerShare;
                              const value = lot.quantity * targetPrice;
                              const exitFees = calculateFees(targetPrice, lot.quantity).total;
                              const pnl = value - cost - exitFees;
                              return (
                                  <tr key={lot.id + idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                      <td className="p-4 text-slate-600 dark:text-slate-400 font-mono text-xs">{lot.date}</td>
                                      <td className="p-4 text-right font-medium text-slate-800 dark:text-slate-200">{lot.quantity.toLocaleString()}</td>
                                      <td className="p-4 text-right font-mono text-slate-500 dark:text-slate-400">{lot.costPerShare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-300">{cost.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                      <td className="p-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{value.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                      <td className="p-4 text-right">
                                          <div className={`font-bold font-mono ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                          </div>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 text-sm font-bold shadow-inner">
                          <tr>
                              <td className="p-4 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Aggregate Total</td>
                              <td className="p-4 text-right">{activeHolding.quantity.toLocaleString()}</td>
                              <td className="p-4 text-right font-mono">{activeHolding.avgPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              <td className="p-4 text-right font-mono">{(activeHolding.quantity * activeHolding.avgPrice).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                              <td className="p-4 text-right font-mono">{(activeHolding.quantity * targetPrice).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                              <td className={`p-4 text-right font-mono ${analysis.currentUnrealizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {analysis.currentUnrealizedPL >= 0 ? '+' : ''}{analysis.currentUnrealizedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </Card>
      )}

      {/* SIMULATOR GRIDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* BUY SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
              <ArrowUpCircle size={18} /> Add Buy Positions
            </h3>
            <button onClick={() => {
                if (buyPositions.length < 10) setBuyPositions([...buyPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: targetPrice }]);
            }} disabled={!activeHolding} className="p-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="space-y-2">
            {analysis.buys.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 shadow-sm">
                <div className="flex flex-col gap-1 w-full sm:flex-1">
                    <span className="text-[9px] text-slate-400 uppercase font-bold">Invest Amount</span>
                    <input type="number" placeholder="e.g. 50000" className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500" onChange={(e) => { const amt = parseFloat(e.target.value) || 0; if (amt > 0 && pos.price > 0) { const qty = Math.floor(amt / (pos.price * 1.005)); const newPos = [...buyPositions]; newPos[idx].quantity = qty; setBuyPositions(newPos); } }} />
                </div>
                <div className="flex items-end gap-2 w-full sm:w-auto">
                    <div className="flex flex-col gap-1 w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Qty</span>
                        <input type="number" value={pos.quantity || ''} onChange={(e) => { const newPos = [...buyPositions]; newPos[idx].quantity = parseInt(e.target.value) || 0; setBuyPositions(newPos); }} className="w-full p-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500 text-center" />
                    </div>
                    <div className="flex flex-col gap-1 w-24">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Buy Price</span>
                        <input type="number" step="0.01" value={pos.price || ''} onChange={(e) => { const newPos = [...buyPositions]; newPos[idx].price = parseFloat(e.target.value) || 0; setBuyPositions(newPos); }} className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-emerald-500 text-center" />
                    </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Avg w/ Fees</span>
                        <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">Rs {(pos.avgBuy || 0).toFixed(2)}</span>
                    </div>
                    <button onClick={() => setBuyPositions(buyPositions.filter(p => p.id !== pos.id))} className="p-2 bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors"> <Trash2 size={14} /> </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SELL SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm">
              <ArrowDownCircle size={18} /> Add Sell Positions
            </h3>
            <button onClick={() => {
                if (sellPositions.length < 10) setSellPositions([...sellPositions, { id: Math.random().toString(36).substring(2, 10), quantity: 0, price: targetPrice, isIntraday: false }]);
            }} disabled={!activeHolding} className="p-1.5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 rounded-lg hover:bg-rose-200 transition-colors disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {analysis.sells.map((pos, idx) => (
              <div key={pos.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-rose-500 shadow-sm">
                <div className="flex items-end gap-2 w-full sm:flex-1">
                    <div className="flex flex-col gap-1 flex-1 sm:w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Sell Qty</span>
                        <input type="number" value={pos.quantity || ''} onChange={(e) => { const newPos = [...sellPositions]; newPos[idx].quantity = parseInt(e.target.value) || 0; setSellPositions(newPos); }} className="w-full p-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-rose-500 text-center" />
                    </div>
                    <div className="flex flex-col gap-1 flex-1 sm:w-24">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Target Price</span>
                        <input type="number" step="0.01" value={pos.price || ''} onChange={(e) => { const newPos = [...sellPositions]; newPos[idx].price = parseFloat(e.target.value) || 0; setSellPositions(newPos); }} className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-rose-500 text-center" />
                    </div>
                    <div className="flex flex-col gap-1 w-20">
                        <span className="text-[9px] text-slate-400 uppercase font-bold text-center">Intraday</span>
                        <button onClick={() => { const newPos = [...sellPositions]; newPos[idx].isIntraday = !newPos[idx].isIntraday; setSellPositions(newPos); }} className={`w-full p-2 rounded-lg text-[10px] font-bold transition-all border ${pos.isIntraday ? 'bg-indigo-600 text-white border-indigo-700 shadow-inner' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600'}`}> {pos.isIntraday ? 'YES' : 'NO'} </button>
                    </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Est. Realized</span>
                        <span className={`text-xs font-bold font-mono ${pos.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}> {pos.profit >= 0 ? '+' : ''}{(pos.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} </span>
                    </div>
                    <button onClick={() => setSellPositions(sellPositions.filter(p => p.id !== pos.id))} className="p-2 bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors"> <Trash2 size={14} /> </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OVERALL ABSOLUTE SUMMARY CARD */}
      {activeHolding && (
          <Card className="p-0 overflow-hidden border-indigo-200 dark:border-indigo-800/50 shadow-xl bg-gradient-to-br from-white to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/20">
              <div className="p-4 bg-indigo-600 dark:bg-indigo-900/50 border-b border-indigo-500 dark:border-indigo-800 flex items-center gap-2 text-white">
                  <LineChart size={20} />
                  <h3 className="font-bold text-sm tracking-wide uppercase">Total Lifetime Net Profit/Loss (If Closed at Target)</h3>
              </div>
              
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6 relative">
                  <div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><History size={10}/> Past Realized (History)</p>
                      <p className={`text-2xl font-black font-mono tracking-tight ${historicalState.historicalRealizedPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {historicalState.historicalRealizedPL >= 0 ? '+' : ''}{historicalState.historicalRealizedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </p>
                  </div>
                  <div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><CheckSquare size={10}/> Simulated Realized</p>
                      <p className={`text-2xl font-black font-mono tracking-tight ${analysis.totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {analysis.totalProfit >= 0 ? '+' : ''}{analysis.totalProfit.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </p>
                      {analysis.totalSellFees > 0 && <p className="text-[9px] text-slate-400 mt-1">Paid {analysis.totalSellFees.toLocaleString(undefined, {maximumFractionDigits:0})} in fees</p>}
                  </div>
                  <div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><Activity size={10}/> Projected Unrealized</p>
                      <p className={`text-2xl font-black font-mono tracking-tight ${analysis.finalUnrealizedPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {analysis.finalUnrealizedPL >= 0 ? '+' : ''}{analysis.finalUnrealizedPL.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </p>
                      {analysis.finalRemainingQty > 0 && <p className="text-[9px] text-slate-400 mt-1">Net of {analysis.finalExitFees.toLocaleString(undefined, {maximumFractionDigits:0})} estimated exit fees</p>}
                  </div>

                  <div className="absolute right-1/4 top-4 bottom-4 w-px bg-indigo-100 dark:bg-indigo-800/50 hidden md:block"></div>

                  <div className="md:pl-4">
                      <p className="text-[10px] text-indigo-500 dark:text-indigo-400 uppercase font-bold mb-1 flex items-center gap-1">Absolute Total P&L</p>
                      <p className={`text-4xl font-black font-mono tracking-tighter ${analysis.totalLifetimeNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {analysis.totalLifetimeNet >= 0 ? '+' : ''}{analysis.totalLifetimeNet.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </p>
                  </div>
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 border-t border-indigo-100 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 font-medium text-center flex flex-col sm:flex-row justify-center items-center gap-2">
                  <span>Absolute Total P&L = (Past Realized) + (Simulated Realized) + (Projected Unrealized)</span>
              </div>
          </Card>
      )}

    </div>
  );
};
