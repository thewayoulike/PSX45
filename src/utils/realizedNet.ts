/** Realized profit already deducts broker sale tax. Subtract only capital gains tax charged outside that profit. */
export function netAfterSeparateCgt(realizedProfit: number, cgt: number): number {
  const tax = Number.isFinite(cgt) ? cgt : 0;
  return realizedProfit - tax;
}
