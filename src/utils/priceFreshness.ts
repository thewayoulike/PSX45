/** Mark quotes older than this as stale in the UI (ms). */
export const STALE_PRICE_MS = 24 * 60 * 60 * 1000;

export function isPriceStale(lastUpdated: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastUpdated) return false;
  const t = new Date(lastUpdated).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t > STALE_PRICE_MS;
}

export function priceFreshnessLabel(lastUpdated: string | null | undefined, nowMs = Date.now()): 'live' | 'stale' | 'unknown' {
  if (!lastUpdated) return 'unknown';
  return isPriceStale(lastUpdated, nowMs) ? 'stale' : 'live';
}
