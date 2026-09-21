import { factFields, finiteNumber, normalizeTicker, validTicker, type FetchedResearch, type FactField } from '../utils/fairValue';

const BRIDGE = 'https://script.google.com/macros/s/AKfycbzbUM26wtJDrXc_iW6JsyjZYcRhMZBkLgyX1Jfll1y16WrhkpSk9XjTxIpGTkQqD1NEhQ/exec';
const TIMEOUT_MS = 15_000;

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error('Source unavailable');
  return response.json();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** All timestamps describe retrieval, not the source's accounting period or quote time. */
export function normalizeFairValueData(ticker: string, quotePayload: unknown, feedPayload: unknown, retrievedAt: string): FetchedResearch {
  const result: FetchedResearch = { facts: {}, sources: {}, reportedDividend: null, warnings: [] };
  const quotes = object(quotePayload).quotes;
  const quote = Array.isArray(quotes)
    ? object(quotes.find(row => normalizeTicker(String(object(row).symbol ?? object(row).Symbol ?? '')) === ticker))
    : object(object(quotes)[ticker]);
  const quoteSymbol = quote.symbol ?? quote.Symbol;
  const quotePrice = quoteSymbol && normalizeTicker(String(quoteSymbol)) !== ticker ? null : finiteNumber(quote.last ?? quote.price ?? quote.last_price ?? quote.Last ?? quote.Price ?? quote.close ?? quote.Close);
  let feed = object(feedPayload);
  if (typeof feed.ticker !== 'string' || normalizeTicker(feed.ticker) !== ticker) {
    feed = {};
    result.warnings.push('The fundamentals feed did not return a matching company. Its figures were not used.');
  }
  const fundamentals = object(feed.fundamentals);
  const balance = object(feed.balanceSheet);
  for (const field of factFields) {
    const value = finiteNumber(field in balance ? balance[field] : fundamentals[field]);
    const permitted = value !== null && (['eps', 'bookValue', 'equity'].includes(field) || (field === 'price' ? value > 0 : value >= 0));
    if (permitted) {
      result.facts[field] = value;
      result.sources[field] = { name: 'Fundamentals feed', retrievedAt };
    }
  }
  if (quotePrice !== null && quotePrice > 0) {
    result.facts.price = quotePrice;
    result.sources.price = { name: 'Market quote', retrievedAt };
  } else {
    result.warnings.push(result.facts.price !== undefined ? 'Market quote unavailable. The price is from the fundamentals feed; its quote time is unknown.' : 'No usable price was returned. Enter or verify the price manually.');
  }
  const dividend = finiteNumber(fundamentals.dividend);
  if (dividend !== null && dividend >= 0) result.reportedDividend = { value: dividend, retrievedAt };
  const missing = factFields.filter((key: FactField) => result.facts[key] === undefined);
  if (missing.length) result.warnings.push(`${missing.length} of ${factFields.length} company figures were not returned. Any existing values in those fields were kept with their original source dates.`);
  return result;
}

export async function fetchFairValueData(rawTicker: string, signal?: AbortSignal): Promise<FetchedResearch> {
  const ticker = normalizeTicker(rawTicker);
  if (!validTicker(ticker)) throw new Error('Enter a valid PSX symbol.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const responses = await Promise.allSettled([
      fetchJson(`/api/pypsx?mode=quotes&symbols=${encodeURIComponent(ticker)}`, controller.signal),
      fetchJson(`${BRIDGE}?ticker=${encodeURIComponent(ticker.toLowerCase())}`, controller.signal),
    ]);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const payload = (i: number) => responses[i].status === 'fulfilled' ? (responses[i] as PromiseFulfilledResult<unknown>).value : null;
    const result = normalizeFairValueData(ticker, payload(0), payload(1), new Date().toISOString());
    if (!Object.keys(result.facts).length) throw new Error('No usable company figures were returned. Your research is unchanged. Retry or enter figures manually.');
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
