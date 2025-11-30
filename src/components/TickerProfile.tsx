import React, { useMemo } from 'react';
import { Transaction, Holding } from '../types';
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, Briefcase, PieChart, History, Coins, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TickerProfileProps {
  ticker: string;
  currentPrice: number;
  sector: string;
  transactions: Transaction[];
  holding?: Holding; 
  onClose: () => void;
}

export const TickerProfile: React.FC<TickerProfileProps> = ({ 
  ticker, currentPrice, sector, transactions, holding, onClose 
}) => {
  
  // --- STATS CALCULATION ---
  const { stats, chartData } = useMemo(() => {
    let totalDividends = 0;
    let dividendTax = 0;
    let totalFees = 0;
    let buyCount = 0;
    let sellCount = 0;
    let totalCashIn = 0; 
    let totalCashOut = 0; 

    // For Charting
    const timeSeries: any[] = [];
    
    // Sort chronologically
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedTxs.forEach(t => {
        const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
        totalFees += fees;
        const gross = t.quantity * t.price;

        if (t.type === 'BUY') {
            buyCount++;
            totalCashIn += (gross + fees);
        } else if (t.type === 'SELL') {
            sellCount++;
            const netProceeds = gross - fees;
            totalCashOut += netProceeds;
        } else if (t.type === 'DIVIDEND') {
            totalDividends += gross;
            dividendTax += (t.tax || 0);
            const netDiv = gross - (t.tax || 0);
            totalCashOut += netDiv;
        }

        // Add point to chart
        if (['BUY', 'SELL', 'DIVIDEND'].includes(t.type)) {
             timeSeries.push({
                 date: t.date,
                 netCashflow: totalCashOut - totalCashIn, 
                 event: t.type
             });
        }
    });

    const currentMarketValue = (holding?.quantity || 0) * currentPrice;
    const lifetimeNet = (totalCashOut + currentMarketValue) - totalCashIn;

    return {
        stats: {
            netDividends: totalDividends - dividendTax,
            totalFees,
            lifetimeNet,
            totalExtracted: totalCashOut
        },
        chartData: timeSeries
    };
  }, [transactions, holding, currentPrice]);

  const quantity = holding?.quantity || 0;
  const avgPrice = holding?.avgPrice || 0;
  const marketValue = quantity * currentPrice;
  
  // Visual Helpers
  const isLifetimeProfit = stats.lifetimeNet >= 0;
  const unrealizedPL = marketValue - (quantity * avgPrice);
  const unrealizedPLPercent = (quantity * avgPrice) > 0 ? (unrealizedPL / (quantity * avgPrice)) * 100 : 0;
  const isUnrealizedProfit = unrealizedPL >= 0;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto animate-in slide-in-from-right duration-300">
      
      {/* HEADER */}
      <div className="bg-white/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-4">
             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800">
                 <ArrowLeft size={24} />
             </button>
             <div>
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                     {ticker}
                     <span className="text-xs font-bold bg-slate-100 text-slate-500 px-3 py-1 rounded-full border border-slate-200 uppercase tracking-wider hidden sm:block">
                         {sector}
                     </span>
                 </h1>
             </div>
         </div>
         <div className="flex items-center gap-6 text-right">
             {quantity > 0 && (
                 <div className="hidden sm:block">
                     <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Current Price</div>
                     <div className="text-xl font-bold text-slate-900 font-mono">
                         Rs. {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                     </div>
                 </div>
             )}
             <div className={`px-4 py-2 rounded-xl border ${isLifetimeProfit ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                 <div className={`text-xs font-bold uppercase tracking-wider ${isLifetimeProfit ? 'text-emerald-600' : 'text-rose-600'}`}>Lifetime Net</div>
                 <div className={`text-xl font-black ${isLifetimeProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isLifetimeProfit ? '+' : ''}{stats.lifetimeNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                 </div>
             </div>
         </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
          
          {/* METRICS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* CARD 1: Position */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Wallet size={100} /></div>
                  <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Briefcase size={18} /></div>
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Current Holding</h3>
                      </div>
                      
                      {quantity > 0 ? (
                          <div className="space-y-1">
                              <div className="text-3xl font-bold text-slate-800">{quantity.toLocaleString()} <span className="text-base font-medium text-slate-400">Shares</span></div>
                              <div className="flex justify-between items-end pt-2">
                                  <div className="text-xs text-slate-500">
                                      Avg: <span className="font-mono font-bold text-slate-700">{avgPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                      Value: <span className="font-mono font-bold text-slate-900">Rs. {marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="py-4 text-slate-400 font-medium italic flex items-center gap-2">
                              <History size={20} /> Position Closed
                          </div>
                      )}
                  </div>
              </div>

              {/* CARD 2: P&L Summary */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={100} /></div>
                  <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                          <div className={`p-2 rounded-lg ${quantity > 0 ? (isUnrealizedProfit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600') : 'bg-slate-100 text-slate-500'}`}>
                              <PieChart size={18} />
                          </div>
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                              {quantity > 0 ? 'Unrealized P&L' : 'Cash Extracted'}
                          </h3>
                      </div>

                      {quantity > 0 ? (
                          <div className="space-y-1">
                              <div className={`text-3xl font-bold ${isUnrealizedProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isUnrealizedProfit ? '+' : ''}{unrealizedPL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                              <div className="text-sm font-bold text-slate-400">
                                  {unrealizedPLPercent.toFixed(2)}% Return
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-1">
                              <div className="text-3xl font-bold text-slate-700">
                                  {stats.totalExtracted.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                              <div className="text-xs text-slate-400">Total Sales + Dividends</div>
                          </div>
                      )}
                  </div>
              </div>

              {/* CARD 3: Income */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Coins size={100} /></div>
                  <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Coins size={18} /></div>
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Passive Income</h3>
                      </div>
                      <div className="space-y-1">
                          <div className="text-3xl font-bold text-indigo-600">
                              +{stats.netDividends.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-slate-400">Net Dividends Collected</div>
                      </div>
                  </div>
              </div>
          </div>

          {/* CHART SECTION */}
          {chartData.length > 1 && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <BarChart3 size={20} className="text-slate-400" />
                          Cumulative Net Cashflow
                      </h3>
                      <div className="text-xs text-slate-400 font-medium bg-slate-50 px-3 py-1 rounded-full">
                          (Cash Out - Cash In) Over Time
                      </div>
                  </div>
                  <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                              <defs>
                                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} minTickGap={30} />
                              <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} tickFormatter={(val) => `${val/1000}k`} />
                              <Tooltip 
                                  contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}
                                  itemStyle={{color: '#0f172a', fontWeight: 'bold', fontSize: '12px'}}
                                  formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Net Cashflow']}
                                  labelStyle={{color: '#64748b', marginBottom: '4px', fontSize: '10px'}}
                              />
                              <Area type="stepAfter" dataKey="netCashflow" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorNet)" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          )}

          {/* HISTORY TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center gap-2">
                  <History size={20} className="text-slate-400" />
                  <h3 className="font-bold text-slate-800 text-lg">Transaction History</h3>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                          <tr>
                              <th className="px-6 py-4">Date</th>
                              <th className="px-6 py-4">Type</th>
                              <th className="px-6 py-4">Broker</th>
                              <th className="px-6 py-4 text-right">Qty</th>
                              <th className="px-6 py-4 text-right">Price</th>
                              <th className="px-6 py-4 text-right">Net Amount</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
                              const total = t.quantity * t.price;
                              const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
                              let net = 0;
                              if (t.type === 'BUY') net = -(total + fees);
                              else if (t.type === 'SELL') net = total - fees;
                              else if (t.type === 'DIVIDEND') net = total - (t.tax || 0);

                              return (
                                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{t.date}</td>
                                      <td className="px-6 py-4">
                                          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                                              t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                              t.type === 'SELL' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                              t.type === 'DIVIDEND' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100'
                                          }`}>{t.type}</span>
                                      </td>
                                      <td className="px-6 py-4 text-slate-500 text-xs">{t.broker || '-'}</td>
                                      <td className="px-6 py-4 text-right text-slate-700 font-medium">{t.quantity.toLocaleString()}</td>
                                      <td className="px-6 py-4 text-right text-slate-600 font-mono">{t.price.toLocaleString()}</td>
                                      <td className={`px-6 py-4 text-right font-bold font-mono ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                          {net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
    </div>
  );
};
