import type { Transaction } from '../types';
import { isFundTicker } from './fundId';
import { daySnapshot, ledgerAsOf } from './cardHistory';

export const PERFORMANCE_METHOD = 'stock-day-pnl-v2';
/** Cache invalidation only, not a security hash. Includes same-count edits. */
export function performanceSourceKey(transactions: Transaction[]): string {
  const source = JSON.stringify(transactions);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${source.length}-${hash >>> 0}`;
}
const EPS = 0.0001;
const buys = new Set(['BUY', 'RIGHTS', 'TRANSFER_IN']);
const sells = new Set(['SELL', 'TRANSFER_OUT']);
const actions = new Set(['BONUS', 'SPLIT']);
export const stockTransactions = (transactions: Transaction[]) => transactions.filter(t =>
  t.ticker && !isFundTicker(t.ticker) && (buys.has(t.type) || sells.has(t.type) || actions.has(t.type)));

/** Corporate actions apply to that broker's opening shares, before same-day trades. */
export function stockBalances(transactions: Transaction[], date: string, inclusive = true): Record<string, number> {
  const positions = new Map<string, { ticker: string; quantity: number }>();
  const ordered = stockTransactions(transactions).filter(t => inclusive ? t.date <= date : t.date < date)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(actions.has(b.type)) - Number(actions.has(a.type)) || (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));
  for (const t of ordered) {
    const key = JSON.stringify([t.portfolioId, t.ticker, t.broker || t.brokerId || '']);
    const position = positions.get(key) || { ticker: t.ticker, quantity: 0 };
    if (t.type === 'SPLIT') { if (t.price > 1) position.quantity *= t.price; }
    else if (buys.has(t.type) || t.type === 'BONUS') position.quantity += t.quantity;
    else if (sells.has(t.type)) position.quantity -= t.quantity;
    positions.set(key, position);
  }
  const result: Record<string, number> = {};
  for (const { ticker, quantity } of positions.values()) result[ticker] = (result[ticker] || 0) + quantity;
  return result;
}

export type StockDayResult = {
  pnl: number; capital: number; percent: number | null; byTicker: Record<string, number>;
  missing: string[]; corporateActions: string[]; marketValue: number | null;
};

/** Trading P&L before fees/dividends. Denominator: opening stock value + purchases/transfers in.
 * Never infer whether a provider's prior price was adjusted on a bonus/split/rights date.
 */
export function stockDayPerformance(transactions: Transaction[], date: string,
  previous: Record<string, number>, current: Record<string, number>): StockDayResult {
  const opening = stockBalances(transactions, date, false), closing = stockBalances(transactions, date);
  const today = stockTransactions(transactions).filter(t => t.date === date);
  const tickers = new Set([...Object.keys(opening), ...Object.keys(closing), ...today.map(t => t.ticker)]);
  let pnl = 0, capital = 0, marketValue = 0, valueMissing = false;
  const missing: string[] = [], corporateActions: string[] = [], byTicker: Record<string, number> = {};
  for (const ticker of tickers) {
    const start = opening[ticker] ?? 0, end = closing[ticker] ?? 0;
    const trades = today.filter(t => t.ticker === ticker);
    if (Math.abs(start) < EPS && Math.abs(end) < EPS && !trades.length) continue;
    const prev = previous[ticker], now = current[ticker];
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < -EPS || end < -EPS) valueMissing = true;
    if (end > EPS && Number.isFinite(now) && now > 0) marketValue += end * now;
    else if (end > EPS) valueMissing = true;
    const transferred = trades.some(t => t.type === 'TRANSFER_IN' || t.type === 'TRANSFER_OUT');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < -EPS || end < -EPS || ((start > EPS || transferred) && !(Number.isFinite(prev) && prev > 0))
      || (end > EPS && !(Number.isFinite(now) && now > 0))) { missing.push(ticker); continue; }
    if (trades.some(t => actions.has(t.type) || t.type === 'RIGHTS')) { corporateActions.push(ticker); continue; }
    let paid = 0, received = 0, transferIn = 0, transferOut = 0;
    if (trades.some(t => !Number.isFinite(t.quantity) || t.quantity < 0 || !Number.isFinite(t.price) || t.price < 0)) { missing.push(ticker); continue; }
    for (const trade of trades) {
      // Transfers carry cost basis in the ledger, not a sale price. Mark their
      // flow at the session reference so moving shares cannot create a profit.
      if (buys.has(trade.type)) paid += trade.quantity * (trade.type === 'TRANSFER_IN' ? prev : trade.price);
      if (sells.has(trade.type)) received += trade.quantity * (trade.type === 'TRANSFER_OUT' ? prev : trade.price);
      if (trade.type === 'TRANSFER_IN') transferIn += trade.quantity * prev;
      if (trade.type === 'TRANSFER_OUT') transferOut += trade.quantity * prev;
    }
    const openingValue = start > EPS ? start * prev : 0;
    const change = (end > EPS ? end * now : 0) + received - paid - openingValue;
    if (!Number.isFinite(change) || !Number.isFinite(paid)) { missing.push(ticker); continue; }
    // Matched transfers inside the selected portfolios do not add new capital.
    pnl += change; capital += openingValue + paid - Math.min(transferIn, transferOut); byTicker[ticker] = change;
  }
  return { pnl, capital, percent: capital > 0 && !missing.length && !corporateActions.length ? pnl / capital * 100 : null,
    missing, corporateActions, byTicker, marketValue: valueMissing ? null : marketValue };
}

export type HistoryPoint = { time: number; price: number; dateStr: string };
export type PerformanceRow = {
  date: string; rawDate: string; Portfolio: number | null; KSE100: number | null; KMI30: number | null;
  method: string; sourceKey: string; fetchedAt: string; pnl?: number | null; capital?: number;
  missing?: string[]; corporateActions?: string[]; netWorth?: number | null; totalReturn?: number | null;
  live?: boolean; quoteTime?: string | null;
};
export function buildPerformanceHistory(transactions: Transaction[], history: Record<string, HistoryPoint[]>, now = new Date()): PerformanceRow[] {
  const sourceKey = performanceSourceKey(transactions);
  const lookup = Object.fromEntries(Object.entries(history).map(([ticker, points]) => [ticker, new Map(points.map(p => [p.dateStr, p.price]))]));
  const sessions = [...new Map((history.KSE100 || []).map(point => [point.dateStr, point])).values()].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return sessions.slice(1).filter(point => point.time >= now.getTime() - 30 * 86400000).map(point => {
    const previousDate = sessions[sessions.indexOf(point) - 1].dateStr;
    const previous = Object.fromEntries(Object.entries(lookup).map(([t, days]) => [t, days.get(previousDate)!]));
    const current = Object.fromEntries(Object.entries(lookup).map(([t, days]) => [t, days.get(point.dateStr)!]));
    const day = stockDayPerformance(transactions, point.dateStr, previous, current);
    const indexReturn = (ticker: string) => Number.isFinite(previous[ticker]) && Number.isFinite(current[ticker]) && previous[ticker] > 0 && current[ticker] > 0 ? (current[ticker] / previous[ticker] - 1) * 100 : null;
    const snapshot = day.marketValue == null ? null : daySnapshot(day.marketValue, ledgerAsOf(transactions, point.dateStr));
    return { date: new Date(`${point.dateStr}T12:00:00+05:00`).toLocaleDateString('en-US', { timeZone: 'Asia/Karachi', month: 'short', day: 'numeric' }),
      rawDate: point.dateStr, Portfolio: day.percent, KSE100: indexReturn('KSE100'), KMI30: indexReturn('KMI30'),
      pnl: day.percent == null ? null : day.pnl, capital: day.capital, missing: day.missing, corporateActions: day.corporateActions,
      netWorth: snapshot?.netWorth ?? null, totalReturn: snapshot?.totalReturn ?? null,
      method: PERFORMANCE_METHOD, sourceKey, fetchedAt: now.toISOString() };
  });
}

export type LiveDay = { date: string; percent: number | null; pnl: number | null; quoteTime: string | null };
/** Replace only the matching session. Never put today's quote on yesterday's date. */
export function withLivePerformance(rows: PerformanceRow[], live: LiveDay, sourceKey: string): PerformanceRow[] {
  return (rows || []).filter(row => row?.method === PERFORMANCE_METHOD && row.sourceKey === sourceKey).map(row => row.rawDate === live.date
    ? { ...row, Portfolio: live.percent, pnl: live.pnl, live: true, quoteTime: live.quoteTime } : row);
}
export function compoundPerformance(rows: PerformanceRow[], key: 'Portfolio' | 'KSE100' | 'KMI30'): number | null {
  if (!rows.length || rows.some(row => typeof row[key] !== 'number' || !Number.isFinite(row[key]))) return null;
  return (rows.reduce((value, row) => value * (1 + row[key]! / 100), 1) - 1) * 100;
}
