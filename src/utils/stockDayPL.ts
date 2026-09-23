export function stockDayChange(opts: {
  quantity: number;
  current: number;
  ldcp: number;
  trades: { type: string; quantity: number; price: number }[];
}): number {
  let netBought = 0;
  let pl = 0;
  for (const t of opts.trades) {
    if (t.type === 'BUY' || t.type === 'TRANSFER_IN') {
      netBought += t.quantity;
      pl += (opts.current - t.price) * t.quantity;
    } else if (t.type === 'SELL' || t.type === 'TRANSFER_OUT') {
      netBought -= t.quantity;
      pl += (t.price - opts.ldcp) * t.quantity;
    }
  }
  const fromOpen = Math.max(0, opts.quantity - Math.max(0, netBought));
  pl += (opts.current - opts.ldcp) * fromOpen;
  return pl;
}
