type CashTrade = {
  type: string;
  quantity?: number;
  price?: number;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
};

/** Net cash a batch needs. Buys, withdrawals and tax spend cash; sells and deposits add it. */
export function batchNetCashNeed(trades: CashTrade[]): number {
  return trades.reduce((need, trade) => {
    const qty = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    const fees = (Number(trade.commission) || 0) + (Number(trade.tax) || 0) + (Number(trade.cdcCharges) || 0) + (Number(trade.otherFees) || 0);
    if (trade.type === 'BUY') return need + qty * price + fees;
    if (trade.type === 'SELL') return need - (qty * price - fees);
    if (trade.type === 'DEPOSIT') return need - price;
    if (trade.type === 'WITHDRAWAL' || trade.type === 'TAX') return need + price;
    return need;
  }, 0);
}
