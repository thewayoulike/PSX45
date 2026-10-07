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

/** Pakistan 24K gold, rupees per tola, from goldrateinpakistan.org. */
export function parsePakistanGoldTola(data: unknown): Level | null {
  const body = data as {
    gold?: { '24k'?: { per_tola?: unknown } };
    change?: { direction?: unknown; percent?: unknown };
  } | null;
  const value = finite(body?.gold?.['24k']?.per_tola);
  if (value == null || value <= 0) return null;
  let changePct = finite(body?.change?.percent);
  const direction = body?.change?.direction;
  if (changePct != null && direction === 'down') changePct = -Math.abs(changePct);
  if (changePct != null && direction === 'up') changePct = Math.abs(changePct);
  return { value, changePct };
}

/**
 * Currency file stores XAU as troy ounces per 1 USD.
 * The dollar quote is the price of one troy ounce.
 */
export function parseGoldOunceQuotes(data: unknown): { usd: Level | null; pkr: Level | null } {
  const rates = (data as { usd?: { xau?: unknown; pkr?: unknown } } | null)?.usd;
  const ouncesPerUsd = finite(rates?.xau);
  if (ouncesPerUsd == null || ouncesPerUsd <= 0) return { usd: null, pkr: null };
  const pkrPerUsd = finite(rates?.pkr);
  return {
    usd: { value: 1 / ouncesPerUsd, changePct: null },
    pkr: pkrPerUsd != null && pkrPerUsd > 0 ? { value: pkrPerUsd / ouncesPerUsd, changePct: null } : null,
  };
}

/** KSE-100, KMI-30, USD/PKR, gold per ounce in dollars, Pakistan gold per tola, then BTC. */
export function buildQuoteStrip(parts: {
  kse?: Level | null;
  kmi?: Level | null;
  pkr?: number | null;
  goldUsd?: Level | null;
  goldTola?: Level | null;
  btc?: Level | null;
}): QuoteItem[] {
  const items: QuoteItem[] = [];
  if (parts.kse) items.push({ label: 'KSE-100', ...parts.kse });
  if (parts.kmi) items.push({ label: 'KMI-30', ...parts.kmi });
  if (typeof parts.pkr === 'number' && Number.isFinite(parts.pkr)) {
    items.push({ label: 'USD/PKR', value: parts.pkr, changePct: null });
  }
  if (parts.goldUsd) items.push({ label: 'XAU/USD', ...parts.goldUsd });
  if (parts.goldTola) items.push({ label: 'Gold/tola', ...parts.goldTola });
  if (parts.btc) items.push({ label: 'BTC', ...parts.btc });
  return items;
}
