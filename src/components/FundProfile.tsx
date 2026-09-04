import React, { useMemo } from 'react';
import { Transaction, Holding } from '../types';
import { ArrowLeft, TrendingUp, Wallet, Briefcase, History, Coins, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fmtFundNav, fmtFundUnits } from '../utils/fundFormat';
import { isUnitInflow, isUnitReinvest, type FundConversionLeg } from '../utils/fundCash';
import { formatAssetLabel, formatConversionSubtext } from '../utils/fundDisplay';

interface FundProfileProps {
  ticker: string;
  fundName: string;
  amc?: string;
  category?: string;
  currentNav: number;
  transactions: Transaction[];
  holding?: Holding;
  displayNames?: Record<string, string>;
  conversionMap?: Map<string, FundConversionLeg>;
  lastUpdated?: string;
  onClose: () => void;
}

const f0 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fK = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);
/** Plain rupee value, e.g. "Rs. 1,234". */
const rs = (n: number) => `Rs. ${f0(n)}`;
/** Signed rupee P&L, e.g. "+Rs. 105" / "−Rs. 419". */
const rsSigned = (n: number) => `${n >= 0 ? '+' : '−'}Rs. ${f0(Math.abs(n))}`;

const isInflow = (t: Transaction) => t.type === 'BUY' || t.type === 'TRANSFER_IN' || isUnitInflow(t);
const isOutflow = (t: Transaction) => t.type === 'SELL' || t.type === 'TRANSFER_OUT';

export const FundProfile: React.FC<FundProfileProps> = ({
  ticker,
  fundName,
  amc,
  category,
  currentNav,
  transactions,
  holding,
  displayNames = {},
  conversionMap = new Map(),
  lastUpdated,
  onClose,
}) => {
  const { stats, realizedStats, incomeStats, rows, balanceSeries, unitsReconcile } = useMemo(() => {
    const sortedAsc = [...transactions].sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (d !== 0) return d;
      const ca = a.createdAt ? Date.parse(a.createdAt) : 0;
      const cb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return ca - cb;
    });

    let units = 0;
    let wac = 0;
    let totalCashIn = 0;
    let totalCashOut = 0;
    let realizedPnL = 0;
    let realizedCost = 0;
    let realizedRevenue = 0;
    let redeemedUnits = 0;
    let convertedOutUnits = 0;
    let dividends = 0;
    let dividendTax = 0;
    let reinvestUnits = 0;

    const rowsAcc: Array<{ tx: Transaction; balance: number; leg?: FundConversionLeg; realized?: number; unrealized: number }> = [];
    const seriesAcc: Array<{ date: string; units: number; value: number }> = [];

    for (const t of sortedAsc) {
      const leg = conversionMap.get(t.id);
      const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
      const gross = t.quantity * t.price;
      let rowRealized: number | undefined;

      if (isInflow(t)) {
        const cost = isUnitInflow(t) ? 0 : gross + fees;
        if (!isUnitInflow(t)) totalCashIn += cost;
        if (isUnitReinvest(t)) reinvestUnits += t.quantity;
        const newQty = units + t.quantity;
        wac = newQty > 0 ? (units * wac + cost) / newQty : 0;
        units = newQty;
      } else if (isOutflow(t)) {
        const netProceeds = gross - fees;
        const cogs = t.quantity * wac;
        rowRealized = netProceeds - cogs;
        realizedPnL += rowRealized;
        realizedCost += cogs;
        realizedRevenue += netProceeds;
        if (leg?.leg === 'out') convertedOutUnits += t.quantity;
        else { redeemedUnits += t.quantity; totalCashOut += netProceeds; }
        units = Math.max(0, units - t.quantity);
        if (units < 0.0001) wac = 0;
      } else if (t.type === 'DIVIDEND') {
        dividends += gross;
        dividendTax += t.tax || 0;
      }

      // Paper P&L on units still held after this row, valued at today's NAV.
      const rowUnrealized = units > 0.0001 ? units * ((currentNav || t.price) - wac) : 0;
      rowsAcc.push({ tx: t, balance: units, leg, realized: rowRealized, unrealized: rowUnrealized });
      seriesAcc.push({ date: t.date.slice(5), units, value: units * (currentNav || t.price) });
    }

    const holdingQty = holding?.quantity ?? units;
    const marketValue = holdingQty * currentNav;
    const investedAtCost = holdingQty * (holding?.avgPrice ?? wac);
    const unrealized = marketValue - investedAtCost;
    const unrealizedPct = investedAtCost > 0 ? (unrealized / investedAtCost) * 100 : 0;
    const realizedROI = realizedCost > 0 ? (realizedPnL / realizedCost) * 100 : 0;

    return {
      stats: {
        units: holdingQty,
        avgNav: holding?.avgPrice ?? wac,
        marketValue,
        invested: investedAtCost,
        unrealized,
        unrealizedPct,
        // Total economic result = realized + unrealized + net cash dividends.
        // Uses WAC-based realized/unrealized so internal converts don't distort it
        // (a convert-in is a BUY and would otherwise look like fresh cash paid).
        lifetimeNet: realizedPnL + unrealized + (dividends - dividendTax),
      },
      realizedStats: {
        pnl: realizedPnL,
        roi: realizedROI,
        redeemedUnits,
        convertedOutUnits,
        proceeds: realizedRevenue,
        cost: realizedCost,
        avgSell: redeemedUnits + convertedOutUnits > 0 ? realizedRevenue / (redeemedUnits + convertedOutUnits) : 0,
      },
      incomeStats: { net: dividends - dividendTax, reinvestUnits },
      rows: [...rowsAcc].reverse(),
      balanceSeries: seriesAcc,
      unitsReconcile: Math.abs(units - holdingQty) < 0.01,
    };
  }, [transactions, holding, currentNav, conversionMap]);

  const badgeFor = (tx: Transaction, leg?: FundConversionLeg) => {
    if (leg?.leg === 'out') return { label: 'CONVERT OUT', cls: 'bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' };
    if (leg?.leg === 'in') return { label: 'CONVERT IN', cls: 'bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' };
    if (tx.type === 'BUY') return { label: 'SUBSCRIBE', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' };
    if (tx.type === 'SELL') return { label: 'REDEEM', cls: 'bg-rose-50 text-rose-600 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' };
    if (tx.type === 'DIVIDEND') return { label: 'DIVIDEND', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' };
    if (isUnitReinvest(tx)) return { label: 'REINVEST', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' };
    if (tx.type === 'REFUND_OF_CAPITAL') return { label: 'BONUS UNITS', cls: 'bg-amber-50 text-amber-600 border-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' };
    return { label: tx.type, cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60' };
  };

  const isLifetimeProfit = stats.lifetimeNet >= 0;
  const isUnrealizedProfit = stats.unrealized >= 0;
  const isRealizedProfit = realizedStats.pnl >= 0;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/60 dark:border-slate-800/60 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-start gap-4 min-w-0">
          <button onClick={onClose} aria-label="Close Profile" className="p-2.5 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-600 dark:text-slate-300 shadow-sm shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight truncate">{fundName}</h1>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {amc && <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60 uppercase tracking-widest w-fit shadow-sm">{amc}</span>}
              {category && <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 px-2 py-1 rounded-md border uppercase tracking-wider shadow-sm">{category}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6 text-right shrink-0">
          <div className="hidden sm:block">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current NAV</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">Rs. {fmtFundNav(currentNav)}</div>
            {lastUpdated && <div className="text-[9px] text-slate-400 tabular-nums">{new Date(lastUpdated).toLocaleDateString()}</div>}
          </div>
          <div className={`px-4 py-2.5 rounded-xl border shadow-sm ${isLifetimeProfit ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest ${isLifetimeProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>Lifetime Net</div>
            <div className={`text-xl font-display font-black tabular-nums ${isLifetimeProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{rsSigned(stats.lifetimeNet)}</div>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-8">
        {!unitsReconcile && (
          <div className="p-4 rounded-2xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-sm text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2">
            <ArrowRightLeft size={16} className="shrink-0" />
            Units from the ledger below don’t match the holdings table for this fund. Check the running balance column for a redeem/convert-out that didn’t deduct.
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-4 md:p-6 shadow-card dark:shadow-card-dark">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20"><TrendingUp size={16} /></div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Units held over time</h3>
          </div>
          {balanceSeries.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={balanceSeries} margin={{ top: 5, right: 5, left: -8, bottom: 0 }}>
                <defs><linearGradient id="fundUnits" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fK} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: number) => [fmtFundUnits(v), 'Units'] as [string, string]} />
                <Area type="stepAfter" dataKey="units" stroke="#10b981" strokeWidth={2} fill="url(#fundUnits)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">Not enough activity to chart.</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Wallet size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm"><Briefcase size={18} /></div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Open Position</h3>
              </div>
              {stats.units > 0.0001 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Units Held</div>
                      <div className="text-2xl font-display font-black text-slate-900 dark:text-white tabular-nums">{fmtFundUnits(stats.units)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-display font-black tabular-nums ${isUnrealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{rsSigned(stats.unrealized)}</div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${isUnrealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>{isUnrealizedProfit ? '+' : ''}{stats.unrealizedPct.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800">
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current NAV</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {fmtFundNav(currentNav)}</div></div>
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Market Value</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {f0(stats.marketValue)}</div></div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-slate-400 font-medium italic flex items-center justify-center gap-2"><History size={20} /> No Open Units</div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm ${realizedStats.redeemedUnits + realizedStats.convertedOutUnits > 0 ? (isRealizedProfit ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20') : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}><CheckCircle size={18} /></div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Realized</h3>
              </div>
              {realizedStats.redeemedUnits + realizedStats.convertedOutUnits > 0 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Units Out</div>
                      <div className="text-2xl font-display font-black text-slate-900 dark:text-white tabular-nums">{fmtFundUnits(realizedStats.redeemedUnits + realizedStats.convertedOutUnits)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-display font-black tabular-nums ${isRealizedProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{rsSigned(realizedStats.pnl)}</div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${isRealizedProfit ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>{isRealizedProfit ? '+' : ''}{realizedStats.roi.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Redeemed</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtFundUnits(realizedStats.redeemedUnits)}</div></div>
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Converted Out</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtFundUnits(realizedStats.convertedOutUnits)}</div></div>
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Proceeds</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{rs(realizedStats.proceeds)}</div></div>
                    <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cost</div><div className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{rs(realizedStats.cost)}</div></div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-slate-400 font-medium italic flex items-center justify-center gap-2"><History size={20} /> No Redemptions</div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Coins size={100} /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm"><Coins size={18} /></div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Income</h3>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{rsSigned(incomeStats.net)}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Net Dividends {incomeStats.reinvestUnits > 0 ? `· ${fmtFundUnits(incomeStats.reinvestUnits)} units reinvested` : ''}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-card dark:shadow-card-dark">
          <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0"><History size={20} /></div>
            <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Fund Ledger</h3>
            <span className="text-xs font-bold text-slate-400 tabular-nums ml-auto">{rows.length} rows</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[1000px] border-collapse">
              <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-widest border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5 text-right">Units</th>
                  <th className="px-5 py-3.5 text-right">NAV</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-right">Realized</th>
                  <th className="px-5 py-3.5 text-right">Unrealized</th>
                  <th className="px-5 py-3.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">No transactions for this fund.</td></tr>
                ) : rows.map(({ tx, balance, leg, realized, unrealized }, i) => {
                  const badge = badgeFor(tx, leg);
                  const gross = tx.quantity * tx.price;
                  const fees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
                  let net = 0;
                  if (isInflow(tx)) net = isUnitInflow(tx) ? 0 : -(gross + fees);
                  else if (isOutflow(tx)) net = gross - fees;
                  else if (tx.type === 'DIVIDEND') net = gross - (tx.tax || 0) - (tx.otherFees || 0);
                  const showUnits = isInflow(tx) || isOutflow(tx);
                  return (
                    <tr key={tx.id || i} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs tabular-nums">{tx.date}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${badge.cls}`}>{badge.label}</span>
                        {leg && <div className="text-[10px] text-slate-400 mt-1">{formatConversionSubtext(leg.leg, leg.otherTicker, displayNames)}</div>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{showUnits ? `${isOutflow(tx) ? '−' : '+'}${fmtFundUnits(tx.quantity)}` : '—'}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400 font-mono tabular-nums">{showUnits ? fmtFundNav(tx.price) : '—'}</td>
                      <td className={`px-5 py-3.5 text-right font-bold font-mono tabular-nums ${net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'}`}>{net === 0 ? '—' : `${net >= 0 ? '+' : ''}${f0(net)}`}</td>
                      <td className={`px-5 py-3.5 text-right font-bold font-mono tabular-nums ${realized == null ? 'text-slate-400' : realized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{realized == null ? '—' : rsSigned(realized)}</td>
                      <td className={`px-5 py-3.5 text-right font-mono tabular-nums ${balance <= 0.0001 ? 'text-slate-400' : unrealized >= 0 ? 'text-emerald-600/90 dark:text-emerald-400/90' : 'text-rose-500/90 dark:text-rose-400/90'}`}>{balance <= 0.0001 ? '—' : rsSigned(unrealized)}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtFundUnits(balance)}</td>
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
