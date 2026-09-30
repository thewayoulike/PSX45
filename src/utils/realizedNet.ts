/** Sale profit minus the tax recorded on each sale. Historical adjustments keep their profit and are not taxed again. */
export function realizedNetOfCgt(trades: Array<{ profit: number; tax?: number; eventType?: string }>): number {
  return trades.reduce((sum, trade) => sum + trade.profit - (trade.eventType ? 0 : (trade.tax || 0)), 0);
}
