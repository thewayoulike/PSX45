// Portfolio maths shared by the app and the PSX Tracker connector, so both always report
// the same holdings, realised trades and totals. Moved verbatim from App.tsx.
import type { Holding, Portfolio, PortfolioStats, PortfolioType, RealizedTrade, Transaction } from '../types';
import { isFundTicker } from './fundId';
import { buildFundTickerCanonicalMap, canonicalFundTicker } from './fundMatch';
import { mergeFundHoldingsByCanon, computeFundBucketAverageCost } from './fundHoldings';
import { buildFundConversionMap, isFundConvertOut, isUnitInflow, isUnitReinvest, reinvestAmount } from './fundCash';
import { applyOpeningCorporateActions } from './corporateActions';
import { formatTransactionLabel } from './fundDisplay';
import { getSector } from '../services/sectors';
import { todayPK } from './dates';
import { fundAvgForCost } from './fundFormat';
import { resolveFundDayNav, type FundNavDayMap, type MutualFundRecord } from '../services/mufapData';
import { stockDayPerformance, stockTransactions } from './stockPerformance';
import { investedCapitalHistory, netInvestedBalance, type NetInvestedPoint } from './peakCapital';
import { principalAndCash } from './cashFlows';
import { sellTaxAllocation } from './sellTax';
import { oversellCashCredit } from './oversellCash';
import { calculateXIRR } from './finance';

export const getPortfolioType = (p?: Portfolio): PortfolioType => p?.type || 'PSX';

export interface HoldingsInput {
  portfolioTransactions: Transaction[];
  fundCatalog: Record<string, MutualFundRecord>;
  sectorOverrides: Record<string, string>;
  portfolios: Portfolio[];
  currentPortfolioId: string;
  manualPrices: Record<string, number>;
  priceTimestamps: Record<string, string>;
}

/** Open positions (FIFO for stocks, average cost for funds) and realised trades. */
export function computeHoldings(input: HoldingsInput): { holdings: Holding[]; realizedTrades: RealizedTrade[] } {
  const { portfolioTransactions, fundCatalog, sectorOverrides, portfolios, currentPortfolioId, manualPrices, priceTimestamps } = input;
  const tempHoldings: Record<string, Holding> = {};
  const tempRealized: RealizedTrade[] = [];

  const displayNamesForCanon: Record<string, string> = {};
  Object.values(fundCatalog).forEach(f => { displayNamesForCanon[f.id] = f.fundName; });
  portfolioTransactions.forEach(t => {
      if (!isFundTicker(t.ticker) || displayNamesForCanon[t.ticker]) return;
      const fromNotes = formatTransactionLabel(t.ticker, {}, t.notes);
      if (fromNotes && !fromNotes.startsWith('MF:')) displayNamesForCanon[t.ticker] = fromNotes;
  });
  const fundCanonFinal = buildFundTickerCanonicalMap(portfolioTransactions, fundCatalog, displayNamesForCanon);
  const fundConversionMap = buildFundConversionMap(portfolioTransactions);
  const activePortfolio = portfolios.find(p => p.id === currentPortfolioId);
  const isFundPort = getPortfolioType(activePortfolio) === 'MUTUAL_FUND';

  const txsByKey: Record<string, Transaction[]> = {};
  portfolioTransactions.forEach(tx => {
      if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ANNUAL_FEE' || tx.type === 'OTHER') return;
      // Fund reinvestments and refunds of capital carry units, so they build lots.
      if (tx.type === 'DIVIDEND' || tx.type === 'TAX') return;
      if (tx.type === 'DIVIDEND_REINVEST' && !isUnitReinvest(tx)) return;
      if (tx.type === 'HISTORY') {
          tempRealized.push({
              id: tx.id, ticker: 'PREV-PNL', broker: tx.broker || 'Unknown', quantity: 1,
              buyAvg: 0, sellPrice: 0, date: tx.date, profit: tx.price, fees: 0,
              commission: 0, tax: tx.tax || 0, cdcCharges: 0, otherFees: 0,
              eventType: 'history',
          });
          return;
      }
      const brokerKey = isFundTicker(tx.ticker) ? '_' : (tx.broker || 'Unknown');
      const canonTicker = canonicalFundTicker(tx.ticker, fundCanonFinal);
      const key = `${canonTicker}|${brokerKey}`;
      if (!txsByKey[key]) txsByKey[key] = [];
      txsByKey[key].push(tx);
  });
  Object.entries(txsByKey).forEach(([key, txs]) => {
      const sep = key.lastIndexOf('|');
      const ticker = key.slice(0, sep);
      const brokerName = key.slice(sep + 1);

      // Mutual funds use AVERAGE COST, not FIFO. The engine is extracted to a
      // pure, unit-tested function (see utils/fundHoldings). Stocks keep the
      // FIFO engine below.
      if (isFundTicker(ticker)) {
          const { holding, realized } = computeFundBucketAverageCost(
              ticker,
              brokerName,
              txs,
              fundConversionMap,
              {
                  sector: fundCatalog[ticker]?.category || sectorOverrides[ticker] || 'Mutual Fund',
                  broker: fundCatalog[ticker]?.amc || '',
                  isFundPortfolio: isFundPort,
              }
          );
          realized.forEach(r => tempRealized.push(r));
          if (holding) tempHoldings[key] = holding;
          return;
      }

      interface Lot {
          quantity: number;
          costPerShare: number;
          date: string;
          commPerShare: number;
          taxPerShare: number;
          cdcPerShare: number;
          otherPerShare: number;
      }
      const lots: Lot[] = [];

      // Group by day so an intraday BUY and SELL square off against each other
      // (a day-trade), then fall back to FIFO across earlier holdings. Dates run
      // oldest-first, and within a day we keep the order the transactions were
      // entered (their position in the list) — the only sequence signal PSX day
      // data gives us. This prevents an intraday sell from eating older lots and
      // avoids phantom/duplicate holdings when a position is squared off same-day.
      const txsByDate: Record<string, Transaction[]> = {};
      txs.forEach(t => {
          if (!txsByDate[t.date]) txsByDate[t.date] = [];
          txsByDate[t.date].push(t);
      });
      const sortedDates = Object.keys(txsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      // Within a day, order by the exact add time (createdAt); legacy rows with
      // no timestamp keep their saved order (stable sort). A SELL squares off
      // only against BUYs entered BEFORE it that day, then falls through to
      // older holdings FIFO (oldest first). This makes same-day results follow
      // the real sequence in which trades were entered.
      const ordVal = (t: Transaction) => (t.createdAt ? Date.parse(t.createdAt) : 0);
      const makeLot = (t: Transaction): Lot => {
          // Units that arrived without you paying in carry no cost. Reinvested
          // dividends and refund-of-capital units are both profit that stayed in
          // the fund, so Total Cost stays your own capital and the units' whole
          // value shows up as gain.
          if (isUnitInflow(t)) {
              return {
                  quantity: t.quantity,
                  costPerShare: 0,
                  date: t.date,
                  commPerShare: 0, taxPerShare: 0, cdcPerShare: 0, otherPerShare: 0,
              };
          }
          const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
          const costPerShare = t.quantity > 0 ? ((t.quantity * t.price) + fees) / t.quantity : 0;
          return {
              quantity: t.quantity,
              costPerShare,
              date: t.date,
              commPerShare: t.quantity > 0 ? (t.commission || 0) / t.quantity : 0,
              taxPerShare: t.quantity > 0 ? (t.tax || 0) / t.quantity : 0,
              cdcPerShare: t.quantity > 0 ? (t.cdcCharges || 0) / t.quantity : 0,
              otherPerShare: t.quantity > 0 ? (t.otherFees || 0) / t.quantity : 0
          };
      };
      let matchSeq = 0;
      sortedDates.forEach(date => {
          const dayTxs = [...txsByDate[date]].sort((a, b) => ordVal(a) - ordVal(b));
          // Bonus shares arrive free. A split rescales shares already held
          // before today's buys and sells, so the same rupee cost is spread
          // across the new quantity.
          applyOpeningCorporateActions(
              lots,
              dayTxs
                  .filter(t => t.type === 'BONUS' || t.type === 'SPLIT')
                  .map(t => ({ id: t.id, type: t.type, quantity: t.quantity, price: t.price, date: t.date })),
          );
          // Build ALL of the day's buy lots up-front (createdAt order) so a SELL
          // can be covered by ANY same-day BUY regardless of entry order. This
          // prevents phantom "held" shares when a sell was recorded before its
          // covering buy. The lot that stays held still follows createdAt order.
          const dayBuyLots: Lot[] = dayTxs
              .filter(t =>
                  t.type === 'BUY' || t.type === 'TRANSFER_IN' || t.type === 'RIGHTS' || isUnitInflow(t)
              )
              .map(makeLot);
          const daySells = dayTxs.filter(t => t.type === 'SELL' || t.type === 'TRANSFER_OUT');
          daySells.forEach(sellTx => {
              let qtyToSell = sellTx.quantity;
              const convertOut = isFundConvertOut(sellTx, fundConversionMap);
              const sellFees = (sellTx.commission || 0) + (sellTx.tax || 0) + (sellTx.cdcCharges || 0) + (sellTx.otherFees || 0);
              const sellFeePerShare = sellTx.quantity > 0 ? sellFees / sellTx.quantity : 0;
              const pushRealized = (lotCost: number, matched: number, lotDate?: string) => {
                  if (sellTx.type === 'TRANSFER_OUT') return;
                  const revenue = matched * sellTx.price;
                  const cost = matched * lotCost;
                  const matchedSellFees = matched * sellFeePerShare;
                  const holdDays = lotDate
                      ? Math.max(0, Math.round((new Date(sellTx.date).getTime() - new Date(lotDate).getTime()) / 86400000))
                      : undefined;
                  tempRealized.push({
                      id: `${sellTx.id}-m${matchSeq++}`,
                      ticker,
                      broker: brokerName,
                      quantity: matched,
                      buyAvg: lotCost,
                      sellPrice: sellTx.price,
                      date: sellTx.date,
                      profit: revenue - cost - matchedSellFees,
                      fees: matchedSellFees,
                      commission: (sellTx.commission || 0) * (matched / sellTx.quantity),
                      tax: (sellTx.tax || 0) * (matched / sellTx.quantity),
                      cdcCharges: (sellTx.cdcCharges || 0) * (matched / sellTx.quantity),
                      otherFees: (sellTx.otherFees || 0) * (matched / sellTx.quantity),
                      eventType: isFundPort ? (convertOut ? 'convert' : 'redemption') : undefined,
                      holdDays,
                  });
              };
              // Convert out redeems existing units — skip same-day buys (prevents
              // convert in/out on the same fund bucket from netting to zero).
              if (!convertOut) {
                  for (const bl of dayBuyLots) {
                      if (qtyToSell <= 0.0001) break;
                      if (bl.quantity > 0) {
                          const matched = Math.min(qtyToSell, bl.quantity);
                          pushRealized(bl.costPerShare, matched, bl.date);
                          bl.quantity -= matched;
                          qtyToSell -= matched;
                      }
                  }
              }
              // Then older holdings, FIFO oldest-first.
              while (qtyToSell > 0.0001 && lots.length > 0) {
                  const fifoLot = lots[0];
                  const matched = Math.min(qtyToSell, fifoLot.quantity);
                  pushRealized(fifoLot.costPerShare, matched, fifoLot.date);
                  fifoLot.quantity -= matched;
                  qtyToSell -= matched;
                  if (fifoLot.quantity < 0.0001) lots.shift();
              }
              if (qtyToSell > 0.0001 && isFundTicker(ticker)) {
                  console.warn(
                      `[PSX45] ${convertOut ? 'Convert out' : 'Sell'} on ${ticker} (${sellTx.date}): ` +
                      `${qtyToSell.toFixed(4)} units had no matching lots — holdings may be short.`
                  );
              }
          });
          dayBuyLots.forEach(l => { if (l.quantity > 0.0001) lots.push(l); });
      });
      if (lots.length > 0) {
          const totalQty = lots.reduce((acc, l) => acc + l.quantity, 0);
          const totalCost = lots.reduce((acc, l) => acc + (l.quantity * l.costPerShare), 0);

          const totalComm = lots.reduce((acc, l) => acc + (l.quantity * l.commPerShare), 0);
          const totalTax = lots.reduce((acc, l) => acc + (l.quantity * l.taxPerShare), 0);
          const totalCDC = lots.reduce((acc, l) => acc + (l.quantity * l.cdcPerShare), 0);
          const totalOther = lots.reduce((acc, l) => acc + (l.quantity * l.otherPerShare), 0);
          const sector = isFundTicker(ticker)
              ? (fundCatalog[ticker]?.category || sectorOverrides[ticker] || 'Mutual Fund')
              : (sectorOverrides[ticker] || getSector(ticker));
          const avgPrice = totalCost / totalQty;
          tempHoldings[key] = {
              ticker,
              sector,
              broker: isFundTicker(ticker) ? (fundCatalog[ticker]?.amc || '') : brokerName,
              quantity: totalQty,
              avgPrice,
              currentPrice: 0,
              totalCommission: totalComm,
              totalTax: totalTax,
              totalCDC: totalCDC,
              totalOtherFees: totalOther
          };
      }
  });
  const mergedHoldings = isFundPort
      ? mergeFundHoldingsByCanon(tempHoldings, fundCanonFinal)
      : tempHoldings;
  const finalHoldings = Object.values(mergedHoldings).filter(h => h.quantity > 0.0001).map(h => {
      const current = manualPrices[h.ticker] || h.avgPrice;
      const lastUpdated = priceTimestamps[h.ticker];
      return { ...h, currentPrice: current, lastUpdated, priceAvailable: manualPrices[h.ticker] > 0 };
  });
  return { holdings: finalHoldings, realizedTrades: tempRealized };
}

export interface StatsInput {
  holdings: Holding[];
  realizedTrades: RealizedTrade[];
  portfolioTransactions: Transaction[];
  ldcpMap: Record<string, number>;
  manualPrices: Record<string, number>;
  priceTimestamps: Record<string, string>;
  marketSessionDate: string | null;
  fundNavDayMap: FundNavDayMap;
  fundCatalog: Record<string, MutualFundRecord>;
  portfolios: Portfolio[];
  currentPortfolioId: string;
  isCombinedView: boolean;
  combinedPortfolioIds: Set<string>;
}

export type ComputedStats = PortfolioStats & { netInvestedHistory: NetInvestedPoint[] };

/** Portfolio totals: value, cost, P/L, dividends, fees, cash, day P/L and returns. */
export function computePortfolioStats(input: StatsInput): ComputedStats {
  const { holdings, realizedTrades, portfolioTransactions, ldcpMap, manualPrices, priceTimestamps, marketSessionDate, fundNavDayMap, fundCatalog, portfolios, currentPortfolioId, isCombinedView, combinedPortfolioIds } = input;
  let totalValue = 0; let totalCost = 0; let totalCommission = 0; let totalSalesTax = 0; let dividendSum = 0; let divTaxSum = 0; let totalCDC = 0; let totalOtherFees = 0; let totalCGT = 0; let totalDeposits = 0; let totalWithdrawals = 0; let transferInValue = 0; let transferOutValue = 0; let historyPnL = 0; let totalReinvest = 0; let stockReinvestMarked = 0; let stockDividendNet = 0;
  let operationalExpenses = 0;
  let fundReinvestIncome = 0;
  let fundTaxWithheld = 0;
  let dailyPL = 0;
  let dailyPreviousValue = 0;
  let dailyMissingPrevious = false;
  const dailyByTicker: Record<string, number> = {};
  let totalAdjustments = 0;
  const today = todayPK();
  const fundPortfolio = portfolios.some(p =>
    (isCombinedView ? combinedPortfolioIds.has(p.id) : p.id === currentPortfolioId)
    && getPortfolioType(p) === 'MUTUAL_FUND'
  );

  holdings.forEach(h => {
      if (isFundTicker(h.ticker) && h.priceAvailable === false) dailyMissingPrevious = true;
      totalValue += h.quantity * h.currentPrice;
      const costAvg = isFundTicker(h.ticker) ? fundAvgForCost(h.avgPrice) : h.avgPrice;
      totalCost += h.quantity * costAvg;
      const ldcpRaw = ldcpMap[h.ticker];
      if (isFundTicker(h.ticker)) {
          const fund = fundCatalog[h.ticker];
          const ldcp = resolveFundDayNav(h.currentPrice, ldcpRaw, {
              priceTimestamp: priceTimestamps[h.ticker],
              dayMark: fundNavDayMap[h.ticker],
              currentValidity: fund?.validityDate,
              catalogPrevNav: fund?.prevNav,
              catalogPrevValidity: fund?.prevValidityDate,
          });
          // Day P&L from yesterday's NAV on units held at start of day (excludes today's subscribe/redeem)
          let netUnitsToday = 0;
          portfolioTransactions.forEach(t => {
              if (t.ticker !== h.ticker || t.date !== today) return;
              if (t.type === 'BUY' || t.type === 'TRANSFER_IN' || isUnitInflow(t)) netUnitsToday += t.quantity;
              if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') netUnitsToday -= t.quantity;
          });
          const startQty = Math.max(0, h.quantity - netUnitsToday);
          const change = (h.currentPrice - ldcp) * startQty;
          dailyPL += change;
          dailyByTicker[h.ticker] = (dailyByTicker[h.ticker] || 0) + change;
          dailyPreviousValue += ldcp * startQty;
          if (!(ldcpRaw > 0) && !(fund?.prevNav > 0)) dailyMissingPrevious = true;
      }
  });

  // Include sold-out positions and count each stock trade once across brokers.
  const stockDay = stockDayPerformance(portfolioTransactions, marketSessionDate || today, ldcpMap, manualPrices);
  dailyPL += stockDay.pnl;
  dailyPreviousValue += stockDay.capital;
  Object.assign(dailyByTicker, stockDay.byTicker);
  const sessionUnconfirmed = !marketSessionDate && stockTransactions(portfolioTransactions).length > 0;
  dailyMissingPrevious ||= sessionUnconfirmed || stockDay.missing.length > 0 || stockDay.corporateActions.length > 0;

  // Flat-NAV / daily-income funds: income booked today counts as day P&L (NAV often unchanged)
  if (fundPortfolio) {
      portfolioTransactions.forEach(t => {
          if (t.date !== today) return;
          if (t.type === 'DIVIDEND') {
              const income = (t.quantity * t.price) - (t.tax || 0) - (t.otherFees || 0);
              dailyPL += income;
              dailyByTicker[t.ticker] = (dailyByTicker[t.ticker] || 0) + income;
          } else if (t.type === 'DIVIDEND_REINVEST') {
              const income = reinvestAmount(t);
              dailyPL += income;
              dailyByTicker[t.ticker] = (dailyByTicker[t.ticker] || 0) + income;
          }
      });
  }

  let realizedPL = realizedTrades.reduce((sum, t) => sum + t.profit, 0);

  const events: { date: string, type: 'IN' | 'OUT' | 'PROFIT' | 'LOSS', amount: number, originalIndex: number, kind?: 'capital' | 'reinvest', bucket?: 'realized' }[] = [];
  const txIndexMap = new Map<string, number>();
  portfolioTransactions.forEach((t, idx) => txIndexMap.set(t.id, idx));
  portfolioTransactions.forEach((t, idx) => {
      totalCommission += (t.commission || 0); totalCDC += (t.cdcCharges || 0); totalOtherFees += (t.otherFees || 0);

      if (t.type === 'DEPOSIT') {
          totalDeposits += t.price;
          events.push({ date: t.date, type: 'IN', amount: t.price, originalIndex: idx });
      }
      else if (t.type === 'WITHDRAWAL') {
          totalWithdrawals += t.price;
          events.push({ date: t.date, type: 'OUT', amount: t.price, originalIndex: idx });
      }
      else if (t.type === 'ANNUAL_FEE') {
          operationalExpenses += t.price;
          events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx });
      }
      else if (t.type === 'OTHER') {
          if (t.category === 'OTHER_TAX' || t.category === 'CDC_CHARGE') {
              operationalExpenses += Math.abs(t.price);
              if (t.category === 'CDC_CHARGE') totalCDC += Math.abs(t.price);
              events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
          } else {
              totalAdjustments += t.price;
              if (t.price >= 0) {
                  events.push({ date: t.date, type: 'PROFIT', amount: t.price, originalIndex: idx });
              } else {
                  events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
              }
          }
      }
      else if (t.type === 'DIVIDEND') {
          const fundDiv = isFundTicker(t.ticker);
          const netDiv = (t.quantity * t.price) - (t.tax || 0) - (t.otherFees || 0);
          dividendSum += netDiv;
          divTaxSum += (t.tax || 0);
          if (fundDiv) { totalCGT += (t.tax || 0); fundTaxWithheld += (t.tax || 0); }
          else stockDividendNet += netDiv;
          if (netDiv >= 0) events.push({ date: t.date, type: 'PROFIT', amount: netDiv, originalIndex: idx });
      }
      else if (t.type === 'DIVIDEND_REINVEST') {
          // A dividend kept in the portfolio is added to the invested base (reinvest bucket).
          // Funds: the row IS the dividend (paid as units), so it counts as income and
          // the cash it adds is spent again in tradingCashFlow below.
          // Stocks: the dividend itself is its own DIVIDEND row, which already counted
          // the income (but not cash: stock dividends are paid to the bank). This row
          // brings that money into the broker cash, so it adds cash but must not count
          // as income a second time.
          const amt = reinvestAmount(t);
          totalReinvest += amt;
          if (isUnitReinvest(t) || fundPortfolio) dividendSum += amt;
          else stockReinvestMarked += amt;
          // The units these bought carry zero cost, so their value already appears
          // as unrealized gain. Tracked separately so Total Return counts it once
          // while the Dividends figure still reports the income received.
          if (isUnitReinvest(t)) fundReinvestIncome += amt;
          // Withheld by the AMC before the units were issued: never passes through
          // the cash balance, and on funds it counts as capital gains tax.
          if (isUnitReinvest(t)) {
              divTaxSum += (t.tax || 0);
              totalCGT += (t.tax || 0);
              fundTaxWithheld += (t.tax || 0);
          }
          events.push({ date: t.date, type: 'IN', amount: amt, originalIndex: idx, kind: 'reinvest' });
      }
      else if (t.type === 'TAX') {
          totalCGT += t.price;
          events.push({ date: t.date, type: 'LOSS', amount: t.price, originalIndex: idx, bucket: 'realized' });
      }
      else if (t.type === 'HISTORY') {
          totalCGT += (t.tax || 0);
          historyPnL += t.price;
          // Historical realized profit is added via realizedTrades below; its CGT
          // also belongs in the dated capital balance, as it does in the card.
          if (t.tax) events.push({ date: t.date, type: 'LOSS', amount: t.tax, originalIndex: idx, bucket: 'realized' });

          if (t.price >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.price, originalIndex: idx });
          else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.price), originalIndex: idx });
      }
      else if (t.type === 'TRANSFER_IN') {
          transferInValue += t.price * t.quantity;
          events.push({ date: t.date, type: 'IN', amount: t.price * t.quantity, originalIndex: idx });
      }
      else if (t.type === 'TRANSFER_OUT') {
          transferOutValue += t.price * t.quantity;
          events.push({ date: t.date, type: 'OUT', amount: t.price * t.quantity, originalIndex: idx });
      }
      else if (t.type === 'SELL' && (t.tax || 0) > 0) {
          const allocated = sellTaxAllocation(isFundTicker(t.ticker), t.tax || 0);
          totalCGT += allocated.cgt;
          fundTaxWithheld += allocated.withheld;
          totalSalesTax += allocated.salesTax;
      }
      else {
          totalSalesTax += (t.tax || 0);
      }
  });

  realizedTrades.forEach((t) => {
      const originalIdx = txIndexMap.get(t.id) ?? 999999;
      if (t.profit >= 0) events.push({ date: t.date, type: 'PROFIT', amount: t.profit, originalIndex: originalIdx, bucket: 'realized' });
      else events.push({ date: t.date, type: 'LOSS', amount: Math.abs(t.profit), originalIndex: originalIdx, bucket: 'realized' });
  });
  events.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return a.originalIndex - b.originalIndex;
  });
  // Realized Gain is profit from selling, so only CGT charged on disposals belongs
  // here. Fund withholding deducted from a dividend is reported under Total CGT but
  // must not show up as a realized loss on a position you never sold.
  const netRealizedPL = realizedPL - (totalCGT - fundTaxWithheld);
  const capitalHistory = investedCapitalHistory(events, fundPortfolio);
  const peakInvested = capitalHistory.peak;
  // Net Invested = capital − withdrawals, where a withdrawal is funded first from
  // TOTAL realized gain (net of CGT), then reinvested dividends, then capital.
  // Only the capital-funded portion of withdrawals reduces Net Invested — so
  // cashing out your gains leaves Net Invested unchanged.
  // A stock dividend can only be reinvested once: anything marked beyond the net
  // dividends actually earned is a data-entry slip and is left out.
  const stockReinvestOver = Math.max(0, stockReinvestMarked - Math.max(0, stockDividendNet));
  totalReinvest -= stockReinvestOver;
  stockReinvestMarked -= stockReinvestOver;
  const flows = principalAndCash({ deposits: totalDeposits, withdrawals: totalWithdrawals, transferIn: transferInValue, transferOut: transferOutValue });
  const { netPrincipal, reinvestRemaining } = netInvestedBalance(flows.principalIn, flows.principalOut, netRealizedPL, totalReinvest, fundPortfolio);
  const peakNetPrincipal = Math.max(peakInvested, netPrincipal);
  const dividendReinvested = reinvestRemaining;
  let tradingCashFlow = 0;
  portfolioTransactions.forEach(t => {
      const val = t.price * t.quantity;
      const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0);
      if (t.type === 'BUY' || t.type === 'RIGHTS') tradingCashFlow -= (val + fees);
      else if (t.type === 'SELL') tradingCashFlow += (val - fees);
      // Units bought with the dividend: cancels the cash the reinvest added.
      // Tax was withheld at source, so only the units' value moves.
      else if (isUnitReinvest(t)) tradingCashFlow -= val;
  });

  let cashIn = flows.cashIn + totalReinvest;
  // Fund withholding is deducted at source, so it reduces CGT and return but was
  // never money sitting in the portfolio to pay out.
  let cashOut = flows.cashOut + (totalCGT - fundTaxWithheld) + operationalExpenses;
  const matchedSellCash = oversellCashCredit(portfolioTransactions);
  const bookedSellCash = portfolioTransactions.reduce((sum, t) => {
      if (t.type !== 'SELL') return sum;
      const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
      return sum + (t.price * t.quantity - fees);
  }, 0);
  const freeCash = cashIn - cashOut + tradingCashFlow - (bookedSellCash - matchedSellCash) + historyPnL + totalAdjustments;

  // Fund dividend withholding is already netted out of the income it was taken
  // from — cash dividends record the net payout, and reinvested units are issued
  // net — so it is reported under Total CGT without being deducted again here.
  const totalNetReturn = netRealizedPL + (totalValue - totalCost) + (dividendSum - fundReinvestIncome) - operationalExpenses + totalAdjustments;

  // Total Return / ROI are measured against PEAK capital (the most you ever had
  // invested), so cashing out gains/capital doesn't inflate the percentage.
  const roiDenominator = peakNetPrincipal > 0 ? peakNetPrincipal : (netPrincipal > 0 ? netPrincipal : 1);
  const roi = (totalNetReturn / roiDenominator) * 100;

  const unrealizedPL = totalValue - totalCost;
  const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
  const cashFlowsForXIRR: { amount: number, date: Date }[] = [];
  portfolioTransactions.forEach(t => {
      if (t.type === 'DEPOSIT') {
           cashFlowsForXIRR.push({ amount: -Math.abs(t.price), date: new Date(t.date) });
      } else if (t.type === 'WITHDRAWAL') {
           cashFlowsForXIRR.push({ amount: Math.abs(t.price), date: new Date(t.date) });
      } else if (t.type === 'DIVIDEND') {
           const netDiv = (t.quantity * t.price) - (t.tax || 0) - (t.otherFees || 0);
           if (netDiv !== 0) cashFlowsForXIRR.push({ amount: netDiv, date: new Date(t.date) });
      } else if (t.type === 'TRANSFER_IN') {
           cashFlowsForXIRR.push({ amount: -Math.abs(t.price * t.quantity), date: new Date(t.date) });
      } else if (t.type === 'TRANSFER_OUT') {
           cashFlowsForXIRR.push({ amount: Math.abs(t.price * t.quantity), date: new Date(t.date) });
      }
  });
  const currentTotalNetWorth = totalValue + freeCash;
  if (currentTotalNetWorth > 0) {
      cashFlowsForXIRR.push({ amount: currentTotalNetWorth, date: new Date() });
  }
  const mwrr = calculateXIRR(cashFlowsForXIRR);

  const dailyPLPercent = dailyPreviousValue > 0 && !dailyMissingPrevious ? (dailyPL / dailyPreviousValue) * 100 : 0;
  const reinvestedProfits = Math.max(0, totalCost - Math.max(0, netPrincipal));
  return {
      totalValue, totalCost, unrealizedPL, unrealizedPLPercent, realizedPL, netRealizedPL,
      totalDividends: dividendSum, totalDividendTax: divTaxSum, dailyPL, dailyPLPercent, dailyPreviousValue, dailyMissingPrevious, dailyByTicker,
      dailySessionDate: fundPortfolio ? undefined : marketSessionDate || undefined,
      dailyUnavailableReason: sessionUnconfirmed ? 'Market session unavailable' : stockDay.corporateActions.length ? 'Corporate-action prices need verification' : dailyMissingPrevious ? 'Prices incomplete' : dailyPreviousValue <= 0 ? 'No exposure for this session' : undefined,
      totalCommission, totalSalesTax, totalCDC,
      totalOtherFees, totalCGT, freeCash, cashInvestment: totalDeposits - totalWithdrawals,
      netPrincipal, peakNetPrincipal, netInvestedHistory: capitalHistory.points, totalDeposits, reinvestedProfits, dividendReinvested, roi, mwrr, totalNetReturn
  };
}
