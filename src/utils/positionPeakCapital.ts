// Peak capital for a single position: the most cost ever open at one time.
// Rows carry `costDelta` (+ cost added by a BUY/TRANSFER_IN, − FIFO cost released
// by a SELL/TRANSFER_OUT). Walked in date + entry-time order, so money re-used
// across many round trips is counted once. Used as the Lifetime ROI denominator.
export interface CostRow {
  date: string;
  createdAt?: string;
  costDelta?: number;
}

export function computePositionPeakCapital(rows: CostRow[]): number {
  const ordKey = (r: CostRow) => (r.createdAt ? Date.parse(r.createdAt) : 0);
  let open = 0;
  let peak = 0;
  [...rows]
    .sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      return d !== 0 ? d : ordKey(a) - ordKey(b);
    })
    .forEach((r) => {
      open = Math.max(0, open + (r.costDelta || 0));
      if (open > peak) peak = open;
    });
  return peak;
}
