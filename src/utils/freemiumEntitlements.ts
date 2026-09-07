/**
 * Free-plan first-N ticker entitlement from transaction history.
 * Order = earliest first-seen date, then ticker as tie-break. Sold symbols count.
 */

export function firstEntitledTickers(
  transactions: { ticker: string; date: string }[],
  limit: number,
): string[] {
  const first = new Map<string, string>();
  for (const t of transactions) {
    const sym = (t.ticker || '').trim().toUpperCase();
    if (!sym) continue;
    const d = t.date || '';
    const prev = first.get(sym);
    if (prev == null || d < prev) first.set(sym, d);
  }
  return [...first.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0].localeCompare(b[0])))
    .slice(0, Math.max(0, limit))
    .map(([sym]) => sym);
}

export function filterTransactionsByTickers<T extends { ticker: string }>(
  txs: T[],
  allowed: Set<string> | string[],
): T[] {
  const set = allowed instanceof Set
    ? allowed
    : new Set(allowed.map((s) => s.toUpperCase()));
  return txs.filter((t) => set.has((t.ticker || '').trim().toUpperCase()));
}

export function isTickerEntitled(ticker: string, allowed: string[]): boolean {
  const sym = (ticker || '').trim().toUpperCase();
  return allowed.some((a) => a.toUpperCase() === sym);
}
