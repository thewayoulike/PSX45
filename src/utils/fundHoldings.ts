import type { Holding } from '../types';
import { canonicalFundTicker } from './fundMatch';

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
