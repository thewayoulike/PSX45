import type { Transaction } from '../types';

/**
 * Mutual fund subscriptions and redemptions are normally settled straight
 * against a bank account rather than a cash balance held with a broker. To keep
 * the ledger balanced we book them as a pair: a DEPOSIT immediately before a
 * subscribe, or a WITHDRAWAL immediately after a redemption. Both rows carry the
 * same `linkId`, and the cash row is flagged `autoCash` so it can be recognised,
 * re-synced, or removed alongside its trade.
 */

/** Net cash a trade moves: cost including fees on a buy, proceeds after fees on a sell. */
export function cashAmountForTrade(tx: Pick<Transaction, 'type' | 'quantity' | 'price' | 'commission' | 'tax' | 'cdcCharges' | 'otherFees'>): number {
  const gross = (tx.quantity || 0) * (tx.price || 0);
  const fees = (tx.commission || 0) + (tx.tax || 0) + (tx.cdcCharges || 0) + (tx.otherFees || 0);
  const net = tx.type === 'SELL' ? gross - fees : gross + fees;
  return Math.max(0, Number(net.toFixed(2)));
}

export function makeLinkId(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? `pair-${crypto.randomUUID()}`
    : `pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Builds the DEPOSIT/WITHDRAWAL that mirrors a fund trade. Returns null if it moves no cash. */
export function buildPairedCashTx(
  trade: Transaction,
  opts: { id: string; linkId: string; createdAt: string }
): Transaction | null {
  const amount = cashAmountForTrade(trade);
  if (amount <= 0) return null;

  const isBuy = trade.type === 'BUY';
  return {
    id: opts.id,
    portfolioId: trade.portfolioId,
    type: isBuy ? 'DEPOSIT' : 'WITHDRAWAL',
    ticker: 'CASH',
    quantity: 1,
    price: amount,
    date: trade.date,
    commission: 0,
    tax: 0,
    cdcCharges: 0,
    otherFees: 0,
    notes: isBuy ? 'Auto: funds transferred in for fund subscription' : 'Auto: redemption proceeds transferred out',
    createdAt: opts.createdAt,
    linkId: opts.linkId,
    autoCash: true,
  };
}

export const isPairableFundTrade = (t: Transaction) => t.type === 'BUY' || t.type === 'SELL';
