// Peak capital for a single position: the most cost still open at the end of any day.
// Rows carry `costDelta` (+ cost added by a BUY/TRANSFER_IN, − FIFO cost released
// by a SELL/TRANSFER_OUT). Same-day buys that are sold the same day do not raise
// the peak. Used as the Lifetime ROI denominator.
export interface CostRow {
  date: string;
  createdAt?: string;
  costDelta?: number;
}

export function computePositionPeakCapital(rows: CostRow[]): number {
  const ordKey = (r: CostRow) => (r.createdAt ? Date.parse(r.createdAt) : 0);
  const sorted = [...rows].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime();
    return d !== 0 ? d : ordKey(a) - ordKey(b);
  });
  let open = 0;
  let peak = 0;
  for (let i = 0; i < sorted.length; ) {
    const date = sorted[i].date;
    while (i < sorted.length && sorted[i].date === date) {
      open = Math.max(0, open + (sorted[i].costDelta || 0));
      i++;
    }
    if (open > peak) peak = open;
  }
  return peak;
}
