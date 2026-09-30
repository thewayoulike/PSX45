export type QuoteItem = { label: string; value: number; changePct: number | null };
export type Level = { value: number; changePct: number | null };

function finite(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** CoinGecko simple price: { bitcoin: { usd, usd_24h_change } }. */
export function parseBtcUsdQuote(data: unknown): Level | null {
  const bitcoin = (data as { bitcoin?: { usd?: unknown; usd_24h_change?: unknown } } | null)?.bitcoin;
  const value = finite(bitcoin?.usd);
  if (value == null) return null;
  return { value, changePct: finite(bitcoin?.usd_24h_change) };
}

/** KSE-100, KMI-30, USD/PKR, then BTC. Missing quotes are left out. */
export function buildQuoteStrip(parts: {
  kse?: Level | null;
  kmi?: Level | null;
  pkr?: number | null;
  btc?: Level | null;
}): QuoteItem[] {
  const items: QuoteItem[] = [];
  if (parts.kse) items.push({ label: 'KSE-100', ...parts.kse });
  if (parts.kmi) items.push({ label: 'KMI-30', ...parts.kmi });
  if (typeof parts.pkr === 'number' && Number.isFinite(parts.pkr)) {
    items.push({ label: 'USD/PKR', value: parts.pkr, changePct: null });
  }
  if (parts.btc) items.push({ label: 'BTC', ...parts.btc });
  return items;
}
