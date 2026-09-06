/**
 * Merge preferred price overlays onto a baseline map.
 * Later overlays win when price > 0. Used by Sync / alerts:
 * market-watch → OHLC → get_quote (or quote first then backup).
 */

export type PriceMap = Record<string, number>;

/** Normalize a pyPSX get_quote payload (or similar) to a positive last price. */
export function quoteToPrice(quote: unknown): number | null {
  if (!quote || typeof quote !== 'object') return null;
  const q = quote as Record<string, unknown>;
  const raw =
    q.last ?? q.price ?? q.last_price ?? q.Last ?? q.Price ?? q.close ?? q.Close;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Extract { SYMBOL: price } from a quotes API payload. */
export function quotesPayloadToPriceMap(payload: unknown): PriceMap {
  const out: PriceMap = {};
  if (!payload || typeof payload !== 'object') return out;
  const p = payload as Record<string, unknown>;

  const quotes = p.quotes;
  if (quotes && typeof quotes === 'object' && !Array.isArray(quotes)) {
    for (const [sym, q] of Object.entries(quotes as Record<string, unknown>)) {
      const price = quoteToPrice(q);
      if (price != null) out[String(sym).toUpperCase()] = price;
    }
    return out;
  }

  if (Array.isArray(quotes)) {
    for (const row of quotes) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const sym = String(r.symbol ?? r.Symbol ?? '').toUpperCase().trim();
      const price = quoteToPrice(r);
      if (sym && price != null) out[sym] = price;
    }
  }
  return out;
}

/**
 * Apply overlays in order. Each overlay only overwrites when price > 0.
 * Returns a new object; does not mutate `base`.
 */
export function mergePriceOverlays(base: PriceMap, ...overlays: PriceMap[]): PriceMap {
  const out: PriceMap = { ...base };
  for (const overlay of overlays) {
    if (!overlay) continue;
    for (const [sym, price] of Object.entries(overlay)) {
      const key = String(sym).toUpperCase();
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
        out[key] = price;
      }
    }
  }
  return out;
}

/** Map app index keys to pyPSX get_index_symbols names. */
export function pypsxIndexName(key: string): string | null {
  const k = String(key || '').trim().toUpperCase().replace(/\s+/g, '');
  if (k === 'KMI30' || k === 'KMI-30') return 'KMI-30';
  if (k === 'KSE100' || k === 'KSE-100') return 'KSE-100';
  return null;
}
