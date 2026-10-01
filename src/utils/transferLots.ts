type LotTrade = {
  type: string;
  date: string;
  quantity: number;
  price: number;
  createdAt?: string;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
};

export type TransferSlice = { quantity: number; price: number };

// Bonus, split and rights change the shares held and their cost, so transfers must apply them too.
const LOT_TYPES = new Set(['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'BONUS', 'SPLIT', 'RIGHTS']);

const costPerShare = (trade: LotTrade) => {
  const fees = (trade.commission || 0) + (trade.tax || 0) + (trade.cdcCharges || 0) + (trade.otherFees || 0);
  return trade.quantity > 0 ? ((trade.quantity * trade.price) + fees) / trade.quantity : trade.price;
};

/** FIFO slices still open on `asOf`, oldest first. Later trades are ignored so a backdated transfer uses that day's cost. */
export function fifoTransferSlices(trades: LotTrade[], quantity: number, asOf: string): TransferSlice[] {
  const open: { quantity: number; price: number; date: string; createdAt: number }[] = [];
  const relevant = trades
    .filter(t => t.date <= asOf && LOT_TYPES.has(t.type))
    .sort((a, b) => a.date.localeCompare(b.date) || (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));
  const byDate = new Map<string, LotTrade[]>();
  for (const trade of relevant) {
    const day = byDate.get(trade.date) || [];
    day.push(trade);
    byDate.set(trade.date, day);
  }
  for (const day of byDate.values()) {
    // Same order as the main FIFO engine: corporate actions open the day, before its trades.
    for (const trade of day) {
      if (trade.type === 'BONUS' && trade.quantity > 0) {
        open.push({ quantity: trade.quantity, price: 0, date: trade.date, createdAt: Date.parse(trade.createdAt || '') || 0 });
      } else if (trade.type === 'SPLIT' && trade.price > 1) {
        for (const lot of open) { lot.quantity *= trade.price; lot.price /= trade.price; }
      }
    }
    for (const trade of day) {
      if (trade.type === 'BUY' || trade.type === 'TRANSFER_IN' || trade.type === 'RIGHTS') {
        open.push({ quantity: trade.quantity, price: costPerShare(trade), date: trade.date, createdAt: Date.parse(trade.createdAt || '') || 0 });
      }
    }
    for (const trade of day) {
      if (trade.type !== 'SELL' && trade.type !== 'TRANSFER_OUT') continue;
      let left = trade.quantity;
      while (left > 0.0001 && open.length) {
        const lot = open[0];
        const matched = Math.min(left, lot.quantity);
        lot.quantity -= matched;
        left -= matched;
        if (lot.quantity <= 0.0001) open.shift();
      }
    }
  }
  const slices: TransferSlice[] = [];
  let left = quantity;
  for (const lot of open) {
    if (left <= 0.0001) break;
    const matched = Math.min(left, lot.quantity);
    slices.push({ quantity: matched, price: lot.price });
    left -= matched;
  }
  return slices;
}
