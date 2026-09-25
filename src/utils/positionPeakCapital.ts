// Peak capital for a single position, used as the Lifetime ROI denominator.
// Rows carry `costDelta` (+ cost added by a BUY/TRANSFER_IN, − FIFO cost released
// by a SELL/TRANSFER_OUT).
// The peak is the most cost still open at the end of any day. A buy added on top
// of shares you already held, then sold the same day, does not raise it.
// A day that opens and closes flat still counts the capital used in that round trip,
// so a stock you only day-traded still has a Lifetime ROI.
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
  let overnightPeak = 0;
  let closedDayPeak = 0;
  for (let i = 0; i < sorted.length; ) {
    const date = sorted[i].date;
    const start = open;
    let dayHigh = open;
    while (i < sorted.length && sorted[i].date === date) {
      open = Math.max(0, open + (sorted[i].costDelta || 0));
      if (open > dayHigh) dayHigh = open;
      i++;
    }
    if (open > overnightPeak) overnightPeak = open;
    if (start <= 0.01 && open <= 0.01 && dayHigh > closedDayPeak) closedDayPeak = dayHigh;
  }
  return Math.max(overnightPeak, closedDayPeak);
}
