/**
 * Server-side pyPSX quotes via /api/pypsx (for cron / Node).
 * Prefer calling this from the browser with relative /api/pypsx — nested
 * Vercel self-HTTP can 502; cron still tries with fallback to market-watch/OHLC.
 */

function quoteToPrice(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const raw = quote.last ?? quote.price ?? quote.last_price ?? quote.Last ?? quote.Price;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function quotesPayloadToPriceMap(payload) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;
  const quotes = payload.quotes;
  if (quotes && typeof quotes === 'object' && !Array.isArray(quotes)) {
    for (const [sym, q] of Object.entries(quotes)) {
      const price = quoteToPrice(q);
      if (price != null) out[String(sym).toUpperCase()] = price;
    }
    return out;
  }
  return out;
}

function getVercelBaseUrl() {
  const candidates = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter(Boolean);
  for (const raw of candidates) {
    if (String(raw).startsWith('http')) return String(raw).replace(/\/$/, '');
    return `https://${raw}`.replace(/\/$/, '');
  }
  return '';
}

/**
 * @param {string[]} symbols
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchPypsxQuotePrices(symbols) {
  const unique = [
    ...new Set(
      (symbols || [])
        .map((s) => String(s || '').toUpperCase().replace(/^PSX:/, '').trim())
        .filter((s) => s && !s.startsWith('MF:'))
    ),
  ];
  if (unique.length === 0) return {};

  const qs = new URLSearchParams({
    mode: 'quotes',
    symbols: unique.join(','),
    t: String(Date.now()),
  });

  // On Vercel cron: absolute URL to the Python function. Locally unused (browser path preferred).
  const base = process.env.VERCEL ? getVercelBaseUrl() : '';
  const url = base ? `${base}/api/pypsx?${qs}` : `/api/pypsx?${qs}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json?.quotes) {
    throw new Error(json?.error || `quotes HTTP ${res.status}`);
  }
  return quotesPayloadToPriceMap(json);
}
