type LotTx = {
  type: string;
  ticker: string;
  quantity: number;
  price: number;
  date: string;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
};

/** Cash a SELL should add: only the shares that matched a lot. */
export function oversellCashCredit(txs: LotTx[]): number {
  const byTicker = new Map<string, LotTx[]>();
  for (const t of txs) {
    if (t.type !== 'BUY' && t.type !== 'SELL') continue;
    const key = t.ticker.toUpperCase();
    const list = byTicker.get(key) || [];
    list.push(t);
    byTicker.set(key, list);
  }
  let credit = 0;
  for (const list of byTicker.values()) {
    const lots: number[] = [];
    for (const t of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
      if (t.type === 'BUY') lots.push(t.quantity);
      else {
        let left = t.quantity;
        while (left > 0.0001 && lots.length) {
          const take = Math.min(left, lots[0]);
          lots[0] -= take;
          left -= take;
          if (lots[0] <= 0.0001) lots.shift();
        }
        const matched = t.quantity - left;
        const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
        const feePer = t.quantity > 0 ? fees / t.quantity : 0;
        credit += matched * (t.price - feePer);
      }
    }
  }
  return credit;
}
