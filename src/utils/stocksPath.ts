/** URL helpers for Profiles → Stocks analyzer (`/stocks` and `/stocks/TICKER`). */

export function stocksPathForTicker(ticker: string | null | undefined): string {
  const t = (ticker || '').trim().toUpperCase();
  return t ? `/stocks/${encodeURIComponent(t)}` : '/stocks';
}

export function tickerFromStocksPath(path: string): string | null {
  const p = path !== '/' ? path.replace(/\/+$/, '') : '/';
  const m = p.match(/^\/stocks\/([^/]+)$/i);
  return m ? decodeURIComponent(m[1]).toUpperCase() : null;
}

/** Legacy `/stock/TICKER` or `/stocks/TICKER` → canonical path + ticker. */
export function normalizeStockDeepLink(
  path: string
): { ticker: string; canonicalPath: string } | null {
  const p = path !== '/' ? path.replace(/\/+$/, '') : '/';
  const legacy = p.match(/^\/stock\/([^/]+)$/i);
  if (legacy) {
    const ticker = decodeURIComponent(legacy[1]).toUpperCase();
    return { ticker, canonicalPath: stocksPathForTicker(ticker) };
  }
  const ticker = tickerFromStocksPath(p);
  if (ticker) return { ticker, canonicalPath: stocksPathForTicker(ticker) };
  return null;
}
