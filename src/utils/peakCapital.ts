export type CapitalEvent = {
  date: string;
  type: 'IN' | 'OUT' | 'PROFIT' | 'LOSS';
  amount: number;
  originalIndex: number;
  kind?: 'capital' | 'reinvest';
  bucket?: 'realized';
};

/** High-water mark of Net Invested. A withdrawal is funded from realized gain first, then reinvested dividends, then capital. */
export function peakNetInvested(events: CapitalEvent[], fundPortfolio: boolean): number {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.originalIndex - b.originalIndex);
  let deposits = 0;
  let withdrawals = 0;
  let realized = 0;
  let reinvest = 0;
  let peak = 0;
  const mark = () => {
    let wLeft = withdrawals;
    wLeft -= Math.min(wLeft, Math.max(0, realized));
    const reinvestUsed = Math.min(wLeft, Math.max(0, reinvest));
    wLeft -= reinvestUsed;
    const capitalRemaining = deposits - wLeft;
    const reinvestRemaining = Math.max(0, reinvest - reinvestUsed);
    const net = Math.max(0, fundPortfolio ? capitalRemaining : capitalRemaining + reinvestRemaining);
    if (net > peak) peak = net;
  };
  for (const event of sorted) {
    if (event.type === 'IN') {
      if (event.kind === 'reinvest') reinvest += event.amount;
      else deposits += event.amount;
    } else if (event.type === 'OUT') {
      withdrawals += event.amount;
    } else if (event.bucket === 'realized') {
      realized += event.type === 'PROFIT' ? event.amount : -event.amount;
    }
    mark();
  }
  return peak;
}
