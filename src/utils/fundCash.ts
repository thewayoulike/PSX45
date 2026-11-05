import type { Transaction } from '../types';
import { isFundTicker } from './fundId';

/**
 * A fund dividend reinvestment issues new units at that day's NAV rather than
 * paying cash out, so for fund portfolios the row carries the fund ticker, units
 * and NAV. PSX rows keep the older shape (ticker 'DIV REINVEST', quantity 1,
 * price = rupee amount), so the two are told apart by the ticker.
 */
export const isUnitReinvest = (t: Pick<Transaction, 'type' | 'ticker'>) =>
  t.type === 'DIVIDEND_REINVEST' && isFundTicker(t.ticker);

/**
 * Bonus units issued to keep your principal whole after a distribution knocks the
 * NAV down. No cash moves, nothing is taxed at issue, and the units are free — so
 * their whole value becomes a capital gain when they are eventually redeemed.
 */
export const isRefundOfCapital = (t: Pick<Transaction, 'type'>) => t.type === 'REFUND_OF_CAPITAL';

/** Units that arrive without a cash purchase and therefore build lots. */
export const isUnitInflow = (t: Pick<Transaction, 'type' | 'ticker'>) =>
  isUnitReinvest(t) || isRefundOfCapital(t);

/** Rupee value of a reinvestment, whichever shape the row uses. */
export const reinvestAmount = (t: Pick<Transaction, 'type' | 'ticker' | 'quantity' | 'price'>) =>
  isUnitReinvest(t) ? (t.quantity || 0) * (t.price || 0) : t.price;

/** Net dividend a stock row paid (gross minus withholding and other deductions). */
const netStockDividend = (t: Pick<Transaction, 'quantity' | 'price' | 'tax' | 'otherFees'>) =>
  (t.quantity || 0) * (t.price || 0) - (t.tax || 0) - (t.otherFees || 0);

/**
 * Stock dividends still free to mark as reinvested: net dividends earned minus
 * what Reinvest Div rows already claimed. You cannot reinvest more than you earned.
 */
export function stockDividendRoomToReinvest(txs: Array<Pick<Transaction, 'id' | 'type' | 'ticker' | 'quantity' | 'price' | 'tax' | 'otherFees'>>, excludeId?: string): number {
  let earned = 0;
  let reinvested = 0;
  for (const t of txs) {
    if (t.id === excludeId) continue;
    if (t.type === 'DIVIDEND' && !isFundTicker(t.ticker)) earned += netStockDividend(t);
    else if (t.type === 'DIVIDEND_REINVEST' && !isUnitReinvest(t)) reinvested += t.price || 0;
  }
  return Math.max(0, Number((earned - reinvested).toFixed(2)));
}

/** Total rupees of dividend income that was reinvested instead of paid out as cash. */
export const dividendReinvestedTotal = (txs: Array<Pick<Transaction, 'type' | 'ticker' | 'quantity' | 'price'>>): number =>
  txs.reduce((sum, t) => sum + (t.type === 'DIVIDEND_REINVEST' ? reinvestAmount(t) : 0), 0);

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
    fundTicker: trade.ticker,
  };
}

export const isPairableFundTrade = (t: Transaction) => t.type === 'BUY' || t.type === 'SELL';

/** One leg of an internal fund switch (redeem + subscribe, no bank cash row). */
export type FundConversionLeg = { leg: 'out' | 'in'; otherTicker: string };


/** Linked SELL+BUY pairs with no autoCash sibling — display as Convert Out / Convert In. */
export function buildFundConversionMap(transactions: Transaction[]): Map<string, FundConversionLeg> {
  const map = new Map<string, FundConversionLeg>();
  const byLink = new Map<string, Transaction[]>();

  for (const t of transactions) {
    if (!t.linkId) continue;
    if (!byLink.has(t.linkId)) byLink.set(t.linkId, []);
    byLink.get(t.linkId)!.push(t);
  }

  for (const legs of byLink.values()) {
    if (legs.some(l => l.autoCash)) continue;
    const sell = legs.find(l => l.type === 'SELL' && isFundTicker(l.ticker));
    const buy = legs.find(l => l.type === 'BUY' && isFundTicker(l.ticker));
    if (sell && buy) {
      map.set(sell.id, { leg: 'out', otherTicker: buy.ticker });
      map.set(buy.id, { leg: 'in', otherTicker: sell.ticker });
    }
  }

  // Older rows may only have Convert to/from notes without linkId.
  for (const sell of transactions) {
    if (map.has(sell.id)) continue;
    if (sell.type !== 'SELL' || !isFundTicker(sell.ticker) || !/^Convert to /i.test(sell.notes || '')) continue;
    const buy = transactions.find(t =>
      !map.has(t.id) &&
      t.type === 'BUY' &&
      isFundTicker(t.ticker) &&
      t.date === sell.date &&
      /^Convert from /i.test(t.notes || '')
    );
    if (buy) {
      map.set(sell.id, { leg: 'out', otherTicker: buy.ticker });
      map.set(buy.id, { leg: 'in', otherTicker: sell.ticker });
    }
  }

  return map;
}

export function getFundConversionLeg(
  tx: Transaction,
  conversionMap: Map<string, FundConversionLeg>
): FundConversionLeg | undefined {
  return conversionMap.get(tx.id);
}

/** UI/export label — underlying type stays BUY or SELL. */
export function getFundTradeDisplayType(
  tx: Transaction,
  conversionMap: Map<string, FundConversionLeg>
): string {
  const conv = conversionMap.get(tx.id);
  if (conv) return conv.leg === 'out' ? 'CONVERT OUT' : 'CONVERT IN';
  return tx.type;
}

/** Params for an internal fund switch (redeem + subscribe, no bank cash). */
export type FundConvertParams = {
  fromTicker: string;
  quantity: number;
  toTicker: string;
  date: string;
  /** Repurchase NAV on the convert date (source fund). */
  sellNav: number;
  /** Offer NAV on the convert date (destination fund). */
  buyNav: number;
  /** Units issued in the destination fund — may differ from units redeemed. */
  destQuantity: number;
  /** CGT / WHT withheld on the redemption (convert out leg). */
  tax?: number;
};

export const CGT_UNITS_NOTE = 'CGT refund paid as units';

/** A CGT refund the AMC paid as units: a negative TAX row plus a BUY of those units, sharing a linkId. */
export function isCgtUnitsPair(transactions: Transaction[], linkId: string): boolean {
  const legs = transactions.filter(t => t.linkId === linkId);
  return !!legs.find(l => l.type === 'TAX') && !!legs.find(l => l.type === 'BUY' && isFundTicker(l.ticker));
}

/** Builds the two linked rows for a CGT refund paid as units. Cash nets to zero; the refund counts and the units join the holding at that NAV. */
export function buildCgtUnitsRefund(opts: { fundTicker: string; units: number; nav: number; date: string; linkId: string; notes?: string }) {
  const amount = Number((opts.units * opts.nav).toFixed(2));
  const zero = { commission: 0, tax: 0, cdcCharges: 0, otherFees: 0 };
  const note = opts.notes ? `${CGT_UNITS_NOTE} — ${opts.notes}` : CGT_UNITS_NOTE;
  return {
    refund: { ...zero, type: 'TAX' as const, ticker: 'CGT', quantity: 1, price: -amount, date: opts.date, fundTicker: opts.fundTicker, linkId: opts.linkId, notes: note },
    units: { ...zero, type: 'BUY' as const, ticker: opts.fundTicker, quantity: opts.units, price: opts.nav, date: opts.date, linkId: opts.linkId, notes: note },
  };
}

export function isFundConversionPair(transactions: Transaction[], linkId: string): boolean {
  const legs = transactions.filter(t => t.linkId === linkId);
  if (legs.some(l => l.autoCash)) return false;
  return !!legs.find(l => l.type === 'SELL' && isFundTicker(l.ticker))
    && !!legs.find(l => l.type === 'BUY' && isFundTicker(l.ticker));
}

export function isFundConvertOut(
  tx: Transaction,
  conversionMap: Map<string, FundConversionLeg>
): boolean {
  return conversionMap.get(tx.id)?.leg === 'out';
}

export function isFundConvertIn(
  tx: Transaction,
  conversionMap: Map<string, FundConversionLeg>
): boolean {
  return conversionMap.get(tx.id)?.leg === 'in';
}

/** Linked convert legs as sell/buy pairs (for holdings). */
export function getFundConvertPairs(
  transactions: Transaction[]
): Array<{ sell: Transaction; buy: Transaction }> {
  const pairs: Array<{ sell: Transaction; buy: Transaction }> = [];
  const seen = new Set<string>();
  const byLink = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.linkId) continue;
    if (!byLink.has(t.linkId)) byLink.set(t.linkId, []);
    byLink.get(t.linkId)!.push(t);
  }
  for (const legs of byLink.values()) {
    if (legs.some(l => l.autoCash)) continue;
    const sell = legs.find(l => l.type === 'SELL' && isFundTicker(l.ticker));
    const buy = legs.find(l => l.type === 'BUY' && isFundTicker(l.ticker));
    if (sell && buy && !seen.has(sell.id)) {
      seen.add(sell.id);
      seen.add(buy.id);
      pairs.push({ sell, buy });
    }
  }
  return pairs;
}
