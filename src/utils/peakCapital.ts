export type CapitalEvent = {
  date: string;
  type: 'IN' | 'OUT' | 'PROFIT' | 'LOSS';
  amount: number;
  originalIndex: number;
  kind?: 'capital' | 'reinvest';
  bucket?: 'realized';
};

export type NetInvestedPoint = { date: string; netInvested: number };

/** Shared by the Capital card and its historical chart: gains fund withdrawals before principal. */
export function netInvestedBalance(deposits: number, withdrawals: number, realized: number, reinvest: number, fundPortfolio: boolean) {
  let wLeft = withdrawals;
  wLeft -= Math.min(wLeft, Math.max(0, realized));
  const reinvestUsed = Math.min(wLeft, Math.max(0, reinvest));
  wLeft -= reinvestUsed;
  const reinvestRemaining = Math.max(0, reinvest - reinvestUsed);
  return {
    netPrincipal: Math.max(0, deposits - wLeft + (fundPortfolio ? 0 : reinvestRemaining)),
    reinvestRemaining,
  };
}

/** End-of-day balances, using only the ledger events known by that date. */
export function investedCapitalHistory(events: CapitalEvent[], fundPortfolio: boolean) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.originalIndex - b.originalIndex);
  let deposits = 0;
  let withdrawals = 0;
  let realized = 0;
  let reinvest = 0;
  let peak = 0;
  const daily = new Map<string, NetInvestedPoint>();
  for (const event of sorted) {
    if (event.type === 'IN') {
      if (event.kind === 'reinvest') reinvest += event.amount;
      else deposits += event.amount;
    } else if (event.type === 'OUT') {
      withdrawals += event.amount;
    } else if (event.bucket === 'realized') {
      realized += event.type === 'PROFIT' ? event.amount : -event.amount;
    }
    const { netPrincipal } = netInvestedBalance(deposits, withdrawals, realized, reinvest, fundPortfolio);
    peak = Math.max(peak, netPrincipal);
    daily.set(event.date, { date: event.date, netInvested: netPrincipal });
  }
  return { peak, points: [...daily.values()] };
}

/** High-water mark includes changes within a day, before same-day withdrawals. */
export function peakNetInvested(events: CapitalEvent[], fundPortfolio: boolean): number {
  return investedCapitalHistory(events, fundPortfolio).peak;
}

/** The last recorded balance on or before a date; never apply a future deposit backwards. */
export function netInvestedOnDate(points: readonly NetInvestedPoint[], date: string): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (points[mid].date <= date) low = mid + 1;
    else high = mid;
  }
  return low ? points[low - 1].netInvested : 0;
}
