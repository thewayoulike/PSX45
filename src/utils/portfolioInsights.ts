import { Holding, PortfolioStats, RealizedTrade, Transaction } from '../types';
import { isFundTicker } from './fundId';
import { fundAvgForCost } from './fundFormat';
import { formatDatePK } from './dates';

const finite = (value: number) => Number.isFinite(value) ? value : 0;
export const holdingCost = (h: Holding) => h.quantity * (
  isFundTicker(h.ticker) ? fundAvgForCost(h.avgPrice) : h.avgPrice
);
export interface InsightPosition { ticker: string; cost: number; profit: number; value: number; percent: number | null }
const rank = (positions: InsightPosition[]) => positions.filter(p => p.cost >= 500)
  .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || a.ticker.localeCompare(b.ticker));
const aggregateLots = (lots: RealizedTrade[]) => {
  const byTicker = new Map<string, InsightPosition>();
  for (const lot of lots) {
    const p = byTicker.get(lot.ticker) || { ticker: lot.ticker, cost: 0, profit: 0, value: 0, percent: null };
    p.cost += finite(lot.buyAvg * lot.quantity); p.profit += finite(lot.profit);
    byTicker.set(lot.ticker, p);
  }
  return rank([...byTicker.values()].map(p => ({ ...p, percent: p.cost > 0 ? p.profit / p.cost * 100 : null })));
};

/** Count each recorded charge once, including fund withholding and standalone charges. */
export function recordedCosts(transactions: Transaction[]) {
  let fees = 0, taxes = 0, dividendTax = 0;
  for (const t of transactions) {
    fees += finite(t.commission) + finite(t.cdcCharges) + finite(t.otherFees);
    taxes += finite(t.tax);
    if (t.type === 'DIVIDEND' || t.type === 'DIVIDEND_REINVEST') dividendTax += finite(t.tax);
    if (t.type === 'ANNUAL_FEE') fees += Math.abs(finite(t.price));
    if (t.type === 'TAX') taxes += finite(t.price);
    if (t.type === 'OTHER' && t.category === 'CDC_CHARGE') fees += Math.abs(finite(t.price));
    if (t.type === 'OTHER' && t.category === 'OTHER_TAX') taxes += Math.abs(finite(t.price));
  }
  return { fees, taxes, dividendTax };
}

export function buildPortfolioInsights(holdings: Holding[], trades: RealizedTrade[], transactions: Transaction[], stats: PortfolioStats, now = new Date()) {
  const byTicker = new Map<string, InsightPosition>();
  const sectors = new Map<string, number>();
  let missingPrices = 0;
  const times: number[] = [];
  let missingTimestamps = 0;
  for (const h of holdings) {
    if (!(h.quantity > 0)) continue;
    if (h.priceAvailable === false || !Number.isFinite(h.currentPrice) || h.currentPrice <= 0) missingPrices++;
    const stamp = Date.parse(h.lastUpdated || '');
    if (Number.isFinite(stamp)) times.push(stamp); else missingTimestamps++;
    const p = byTicker.get(h.ticker) || { ticker: h.ticker, cost: 0, profit: 0, value: 0, percent: null };
    p.cost += holdingCost(h); p.value += finite(h.currentPrice * h.quantity);
    byTicker.set(h.ticker, p);
    sectors.set(h.sector || 'Other', (sectors.get(h.sector || 'Other') || 0) + finite(h.currentPrice * h.quantity));
  }
  const positions = [...byTicker.values()].map(p => ({ ...p, profit: p.value - p.cost, percent: p.cost > 0 ? (p.value - p.cost) / p.cost * 100 : null }));
  const holdingRanks = rank([...positions]);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const top = [...positions].sort((a, b) => b.value - a.value).slice(0, 3);
  const lots = trades.filter(t => t.ticker && t.ticker !== 'PREV-PNL' && t.eventType !== 'history' && Number.isFinite(t.profit));
  const wins = lots.filter(t => t.profit > 0), losses = lots.filter(t => t.profit < 0);
  const grossWins = wins.reduce((s, t) => s + t.profit, 0), grossLosses = -losses.reduce((s, t) => s + t.profit, 0);
  const monthKey = formatDatePK(now).slice(0, 7);
  const monthly = aggregateLots(lots.filter(t => t.date?.startsWith(monthKey)));
  const realized = aggregateLots(lots);
  const moves = Object.entries(stats.dailyByTicker || {}).map(([ticker, amount]) => ({ ticker, amount })).filter(m => Number.isFinite(m.amount));
  const oldestPrice = times.length ? Math.min(...times) : null;
  return {
    positions, totalValue, missingPrices, missingTimestamps, oldestPrice,
    oldPrices: oldestPrice !== null && now.getTime() - oldestPrice > 24 * 60 * 60 * 1000,
    priorDayPrices: oldestPrice !== null && formatDatePK(new Date(oldestPrice)) < formatDatePK(now),
    underwater: positions.filter(p => p.profit < -0.005).length,
    bestHolding: holdingRanks[0], worstHolding: holdingRanks.at(-1),
    largestLoss: [...positions].filter(p => p.profit < -0.005).sort((a, b) => a.profit - b.profit)[0],
    top, topPercent: totalValue > 0 ? top.reduce((s, p) => s + p.value, 0) / totalValue * 100 : null,
    largestSector: [...sectors].sort((a, b) => b[1] - a[1])[0],
    lots, wins: wins.length, losses: losses.length, flat: lots.length - wins.length - losses.length,
    winRate: lots.length ? wins.length / lots.length * 100 : null,
    avgWin: wins.length ? grossWins / wins.length : null, avgLoss: losses.length ? grossLosses / losses.length : null,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    bestSold: realized[0], worstSold: realized.at(-1),
    bestExit: [...wins].sort((a, b) => b.profit - a.profit)[0], worstExit: [...losses].sort((a, b) => a.profit - b.profit)[0],
    monthKey, bestMonth: monthly[0], worstMonth: monthly.at(-1),
    bestDay: moves.filter(m => m.amount > 0).sort((a, b) => b.amount - a.amount)[0],
    worstDay: moves.filter(m => m.amount < 0).sort((a, b) => a.amount - b.amount)[0],
    dailyPercent: !missingPrices && !stats.dailyMissingPrevious && (stats.dailyPreviousValue ?? 0) > 0
      ? stats.dailyPL / stats.dailyPreviousValue! * 100 : null,
    cashPercent: stats.totalValue + stats.freeCash > 0 ? stats.freeCash / (stats.totalValue + stats.freeCash) * 100 : null,
    costs: recordedCosts(transactions),
  };
}
