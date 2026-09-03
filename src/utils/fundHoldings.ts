import type { Holding, Transaction, RealizedTrade } from '../types';
import { canonicalFundTicker } from './fundMatch';
import { isUnitInflow, isFundConvertOut, type FundConversionLeg } from './fundCash';

export interface FundBucketResult {
  holding: Holding | null;
  realized: RealizedTrade[];
}

/**
 * Average-cost (WAC) engine for a single fund bucket. Mutual funds pool every
 * subscribe/reinvest into one blended cost — reinvested and bonus units add units
 * at zero cost, pulling the average NAV down — and a redemption or convert-out then
 * realizes gain against that blended NAV (matches AMC statements and the fund
 * profile). This is intentionally NOT FIFO; that would let a redemption pick a
 * single full-price lot and hide the gain the free units created.
 *
 * Pure and deterministic so it can be unit-tested in isolation.
 */
export function computeFundBucketAverageCost(
  ticker: string,
  brokerName: string,
  txs: Transaction[],
  conversionMap: Map<string, FundConversionLeg>,
  meta: { sector: string; broker: string; isFundPortfolio: boolean }
): FundBucketResult {
  const realized: RealizedTrade[] = [];
  const ordered = [...txs].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (d !== 0) return d;
    const ca = a.createdAt ? Date.parse(a.createdAt) : 0;
    const cb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ca - cb;
  });

  let poolUnits = 0;
  let poolCost = 0;
  let heldComm = 0, heldTax = 0, heldCDC = 0, heldOther = 0;
  let firstBuyDate: string | undefined;
  let seq = 0;

  for (const t of ordered) {
    const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
    if (t.type === 'BUY' || t.type === 'TRANSFER_IN' || isUnitInflow(t)) {
      const cost = isUnitInflow(t) ? 0 : t.quantity * t.price + fees;
      poolUnits += t.quantity;
      poolCost += cost;
      if (!firstBuyDate) firstBuyDate = t.date;
      if (!isUnitInflow(t)) {
        heldComm += t.commission || 0;
        heldTax += t.tax || 0;
        heldCDC += t.cdcCharges || 0;
        heldOther += t.otherFees || 0;
      }
    } else if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') {
      const convertOut = isFundConvertOut(t, conversionMap);
      const avgCost = poolUnits > 0 ? poolCost / poolUnits : 0;
      const matched = Math.min(t.quantity, poolUnits);
      const ratio = t.quantity > 0 ? matched / t.quantity : 0;
      const cost = matched * avgCost;
      const proceeds = matched * t.price - fees * ratio;
      const holdDays = firstBuyDate
        ? Math.max(0, Math.round((new Date(t.date).getTime() - new Date(firstBuyDate).getTime()) / 86400000))
        : undefined;
      if (matched > 0.0001) {
        realized.push({
          id: `${t.id}-m${seq++}`,
          ticker,
          broker: brokerName,
          quantity: matched,
          buyAvg: avgCost,
          sellPrice: t.price,
          date: t.date,
          profit: proceeds - cost,
          fees: fees * ratio,
          commission: (t.commission || 0) * ratio,
          tax: (t.tax || 0) * ratio,
          cdcCharges: (t.cdcCharges || 0) * ratio,
          otherFees: (t.otherFees || 0) * ratio,
          eventType: meta.isFundPortfolio ? (convertOut ? 'convert' : 'redemption') : undefined,
          holdDays,
        });
      }
      const before = poolUnits;
      poolUnits -= matched;
      poolCost -= cost;
      if (before > 0) {
        const keepFrac = Math.max(0, poolUnits) / before;
        heldComm *= keepFrac; heldTax *= keepFrac; heldCDC *= keepFrac; heldOther *= keepFrac;
      }
      if (poolUnits < 0.0001) { poolUnits = 0; poolCost = 0; firstBuyDate = undefined; }
    }
  }

  const holding: Holding | null = poolUnits > 0.0001
    ? {
        ticker,
        sector: meta.sector,
        broker: meta.broker,
        quantity: poolUnits,
        avgPrice: poolCost / poolUnits,
        currentPrice: 0,
        totalCommission: heldComm,
        totalTax: heldTax,
        totalCDC: heldCDC,
        totalOtherFees: heldOther,
      }
    : null;

  return { holding, realized };
}

/** Combine rows that canonicalize to the same fund (legacy import id + catalog id). */
export function mergeFundHoldingsByCanon(
  holdings: Record<string, Holding>,
  canonMap: Map<string, string>
): Record<string, Holding> {
  const out: Record<string, Holding> = {};
  for (const [key, h] of Object.entries(holdings)) {
    const sep = key.lastIndexOf('|');
    const broker = sep >= 0 ? key.slice(sep + 1) : '_';
    const canon = canonicalFundTicker(h.ticker, canonMap);
    const mkey = `${canon}|${broker}`;
    const existing = out[mkey];
    if (!existing) {
      out[mkey] = { ...h, ticker: canon };
      continue;
    }
    const totalQty = existing.quantity + h.quantity;
    const totalCost = existing.quantity * existing.avgPrice + h.quantity * h.avgPrice;
    out[mkey] = {
      ...existing,
      ticker: canon,
      quantity: totalQty,
      avgPrice: totalQty > 0 ? totalCost / totalQty : 0,
      totalCommission: existing.totalCommission + h.totalCommission,
      totalTax: existing.totalTax + h.totalTax,
      totalCDC: existing.totalCDC + h.totalCDC,
      totalOtherFees: existing.totalOtherFees + h.totalOtherFees,
    };
  }
  return out;
}
