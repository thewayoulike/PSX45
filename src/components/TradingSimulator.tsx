import React, { useState, useMemo } from 'react';
import { Holding, Broker, Transaction } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Calculator, Info } from 'lucide-react';

interface TradingSimulatorProps {
  holdings: Holding[];
  brokers: Broker[];
  defaultBrokerId: string;
}

interface SimPosition {
  id: string;
  quantity: number;
  price: number;
  isIntraday: boolean;
  investment?: number; // Only for Buy UI
}

export const TradingSimulator: React.FC<TradingSimulatorProps> = ({ holdings, brokers, defaultBrokerId }) => {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [buyPositions, setBuyPositions] = useState<SimPosition[]>([]);
  const [sellPositions, setSellPositions] = useState<SimPosition[]>([]);

  const activeHolding = holdings.find(h => h.ticker === selectedTicker);
  const broker = brokers.find(b => b.id === defaultBrokerId) || brokers[0];

  // Logic to calculate fees based on your broker manager settings
  const calculateFees = (price: number, qty: number) => {
    const amount = price * qty;
    let commission = 0;
    if (broker.commissionType === 'PERCENT') {
      commission = amount * (broker.rate1 / 100);
    } else {
      // HIGHER_OF logic
      const perShare = qty * broker.rate2;
      const percentage = amount * (broker.rate1 / 100);
      commission = Math.max(perShare, percentage);
    }
    const sst = commission * (broker.sstRate / 100);
    // Standard PSX Charges (can be made dynamic later)
    const cdc = amount * 0.00005; 
    const other = amount * 0.0001;
    return { commission, sst, cdc, other, total: commission + sst + cdc + other };
  };

  const addBuyRow = () => {
    if (buyPositions.length < 10) {
      setBuyPositions([...buyPositions, { id: Date.now().toString(), quantity: 0, price: activeHolding?.currentPrice || 0, isIntraday: false }]);
    }
  };

  const addSellRow = () => {
    if (sellPositions.length < 10) {
      setSellPositions([...sellPositions, { id: Date.now().toString(), quantity: 0, price: activeHolding?.currentPrice || 0, isIntraday: false }]);
    }
  };

  // Calculations for Buy Section
  const buySummary = useMemo(() => {
    let totalQty = 0;
    let totalCostWithFees = 0;
    buyPositions.forEach(p => {
      const fees = calculateFees(p.price, p.quantity);
      totalQty += p.quantity;
      totalCostWithFees += (p.price * p.quantity) + fees.total;
    });

    const currentCost = (activeHolding?.quantity || 0) * (activeHolding?.avgPrice || 0);
    const newTotalQty = (activeHolding?.quantity || 0) + totalQty;
    const newAvgPrice = newTotalQty > 0 ? (currentCost + totalCostWithFees) / newTotalQty : 0;

    return { totalQty, totalCostWithFees, newAvgPrice };
  }, [buyPositions, activeHolding, broker]);

  // Calculations for Sell Section (FIFO Logic)
  const sellSummary = useMemo(() => {
    let totalProfit = 0;
    let totalSellFees = 0;
    
    // Simple FIFO simulation for the purpose of the calculator
    sellPositions.forEach(p => {
      const sellFees = p.isIntraday ? 0 : calculateFees(p.price, p.quantity).total;
      const buyCost = p.quantity * (activeHolding?.avgPrice || 0);
      const sellRevenue = p.quantity * p.price;
      totalProfit += (sellRevenue - buyCost - sellFees);
      totalSellFees += sellFees;
    });

    return { totalProfit, totalSellFees };
  }, [sellPositions, activeHolding]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      {/* 1. Selector */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="w-full md:w-1/3">
            <label className="block text-sm font-bold text-slate-500 mb-2">Select Stock from Holdings</label>
            <select 
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value)}
            >
              <option value="">Choose a stock...</option>
              {holdings.map(h => <option key={h.ticker} value={h.ticker}>{h.ticker}</option>)}
            </select>
          </div>
          
          {activeHolding && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 w-full">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <p className="text-xs text-slate-500">Current Qty</p>
                <p className="font-bold">{activeHolding.quantity.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <p className="text-xs text-slate-500">Current Avg</p>
                <p className="font-bold">Rs. {activeHolding.avgPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <p className="text-xs text-slate-500">Market Price</p>
                <p className="font-bold text-emerald-600">Rs. {activeHolding.currentPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <p className="text-xs text-emerald-600">Break-even</p>
                <p className="font-bold text-emerald-700">Rs. {(activeHolding.avgPrice * 1.005).toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BUY SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold flex items-center gap-2 text-emerald-600">
              <ArrowUpCircle /> Buy Positions
            </h3>
            <button onClick={addBuyRow} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
              <Plus size={18} />
            </button>
          </div>
          
          {buyPositions.map((pos, idx) => (
            <Card key={pos.id} className="p-4 border-l-4 border-l-emerald-500">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Investment Amount</label>
                  <input 
                    type="number" 
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border-none"
                    placeholder="Enter Amount"
                    onChange={(e) => {
                        const amt = parseFloat(e.target.value) || 0;
                        const qty = Math.floor(amt / (pos.price * 1.005)); // Rough estimate including fees
                        const newPos = [...buyPositions];
                        newPos[idx].quantity = qty;
                        setBuyPositions(newPos);
                    }}
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Qty</label>
                  <input 
                    type="number" value={pos.quantity}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border-none"
                    onChange={(e) => {
                        const newPos = [...buyPositions];
                        newPos[idx].quantity = parseInt(e.target.value) || 0;
                        setBuyPositions(newPos);
                    }}
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Price</label>
                  <input 
                    type="number" value={pos.price}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border-none"
                    onChange={(e) => {
                        const newPos = [...buyPositions];
                        newPos[idx].price = parseFloat(e.target.value) || 0;
                        setBuyPositions(newPos);
                    }}
                  />
                </div>
                <button 
                  onClick={() => setBuyPositions(buyPositions.filter(p => p.id !== pos.id))}
                  className="col-span-1 p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </Card>
          ))}
          
          {buyPositions.length > 0 && (
            <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg">
                <div className="flex justify-between items-center mb-2 border-b border-emerald-500 pb-2">
                    <span>Simulated Avg Price</span>
                    <span className="text-xl font-bold">Rs. {buySummary.newAvgPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm opacity-90">
                    <span>New Total Shares</span>
                    <span>{( (activeHolding?.quantity || 0) + buySummary.totalQty).toLocaleString()}</span>
                </div>
            </div>
          )}
        </div>

        {/* SELL SECTION */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold flex items-center gap-2 text-rose-600">
              <ArrowDownCircle /> Sell Positions
            </h3>
            <button onClick={addSellRow} className="p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors">
              <Plus size={18} />
            </button>
          </div>

          {sellPositions.map((pos, idx) => (
            <Card key={pos.id} className="p-4 border-l-4 border-l-rose-500">
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Shares to Sell</label>
                  <input 
                    type="number" value={pos.quantity}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border-none font-bold"
                    onChange={(e) => {
                        const newPos = [...sellPositions];
                        newPos[idx].quantity = parseInt(e.target.value) || 0;
                        setSellPositions(newPos);
                    }}
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Target Price</label>
                  <input 
                    type="number" value={pos.price}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border-none"
                    onChange={(e) => {
                        const newPos = [...sellPositions];
                        newPos[idx].price = parseFloat(e.target.value) || 0;
                        setSellPositions(newPos);
                    }}
                  />
                </div>
                <div className="col-span-4 flex flex-col items-center">
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1">Intra-day?</label>
                    <button 
                        onClick={() => {
                            const newPos = [...sellPositions];
                            newPos[idx].isIntraday = !newPos[idx].isIntraday;
                            setSellPositions(newPos);
                        }}
                        className={`w-full py-1.5 px-3 rounded-lg text-[10px] font-bold transition-colors ${pos.isIntraday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                    >
                        {pos.isIntraday ? 'YES' : 'NO'}
                    </button>
                </div>
                <button 
                  onClick={() => setSellPositions(sellPositions.filter(p => p.id !== pos.id))}
                  className="col-span-1 p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </Card>
          ))}

          {sellPositions.length > 0 && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-700">
                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
                    <span>Expected Net Profit</span>
                    <span className={`text-xl font-bold ${sellSummary.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Rs. {sellSummary.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                    <span>Total Selling Fees</span>
                    <span>Rs. {sellSummary.totalSellFees.toLocaleString()}</span>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER INFO */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-start gap-3 text-sm text-blue-700 dark:text-blue-300">
          <Info size={20} className="shrink-0 mt-0.5" />
          <p>This simulator uses the <strong>{broker.name}</strong> rate profiles. Sales are calculated using <strong>FIFO</strong> logic against your current average price. Intra-day sales assume zero selling expenses as per your requirement.</p>
      </div>
    </div>
  );
};
