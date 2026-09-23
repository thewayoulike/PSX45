import { toDatePK } from './dates';

export function normalizeScannedTrade<T extends { ticker?: string; type?: string; date?: string }>(trade: T): T {
  const parsed = trade.date ? toDatePK(trade.date) : '';
  return {
    ...trade,
    ticker: String(trade.ticker || '').trim().toUpperCase(),
    type: String(trade.type || '').trim().toUpperCase(),
    date: trade.date ? parsed : trade.date,
  };
}
