export type QtyTrade = {
  type: string;
  ticker: string;
  brokerId?: string;
  quantity: number;
  date?: string;
};

/** First SELL in date order that would take this broker's holding negative. */
export function firstOversell(
  trades: QtyTrade[],
  held: (ticker: string, brokerId: string) => number,
): QtyTrade | null {
  const running = new Map<string, number>();
  const ordered = [...trades]
    .filter((t) => t.type === 'BUY' || t.type === 'SELL' || t.type === 'TRANSFER_IN' || t.type === 'TRANSFER_OUT')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const t of ordered) {
    const key = `${(t.ticker || '').toUpperCase()}|${t.brokerId || ''}`;
    if (!running.has(key)) running.set(key, held(t.ticker, t.brokerId || ''));
    const delta = t.type === 'BUY' || t.type === 'TRANSFER_IN' ? Number(t.quantity) : -Number(t.quantity);
    const next = (running.get(key) || 0) + delta;
    if ((t.type === 'SELL' || t.type === 'TRANSFER_OUT') && next < -0.0001) return t;
    running.set(key, next);
  }
  return null;
}
