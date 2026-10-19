export const COMMODITY_INSTRUMENTS = [
  { id: 'gold', name: 'Gold', symbol: 'GC=F', unit: 'troy oz' },
  { id: 'silver', name: 'Silver', symbol: 'SI=F', unit: 'troy oz' },
  { id: 'copper', name: 'Copper', symbol: 'HG=F', unit: 'lb' },
  { id: 'wti', name: 'Crude Oil (WTI)', symbol: 'CL=F', unit: 'barrel' },
];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = (seconds, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seconds * 1000));

export function parseCommodityHistory(raw, spec) {
  const result = raw?.chart?.result?.[0], meta = result?.meta;
  if (raw?.chart?.error || meta?.symbol !== spec.symbol || meta?.currency !== 'USD' || meta?.instrumentType !== 'FUTURE'
    || !finite(meta.regularMarketPrice) || !finite(meta.regularMarketTime) || meta.regularMarketTime <= 0) throw new Error('Invalid commodity quote');
  const zone = meta.exchangeTimezoneName || 'America/New_York';
  const asOf = new Date(meta.regularMarketTime * 1000).toISOString();
  const quoteDate = day(meta.regularMarketTime, zone);
  const points = new Map();
  const closes = result.indicators?.quote?.[0]?.close;
  if (Array.isArray(result.timestamp) && Array.isArray(closes)) result.timestamp.forEach((time, i) => {
    if (!finite(time) || time <= 0 || time > meta.regularMarketTime || !finite(closes[i])) return;
    const date = day(time, zone);
    // Retain negative futures prices (e.g. WTI in April 2020); missing prices stay absent.
    if (date <= quoteDate) points.set(date, { date, close: closes[i] });
  });
  points.set(quoteDate, { date: quoteDate, close: meta.regularMarketPrice });
  const history = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (history.length < 2) throw new Error('Commodity history unavailable');
  // A 10-year response's chartPreviousClose belongs to the START of that range.
  // The daily quote can also refer to a newly rolled contract. Do not substitute
  // the previous continuous-series bar for that contract's previous close.
  const previousClose = finite(meta.previousClose) ? meta.previousClose : finite(meta.regularMarketPreviousClose) ? meta.regularMarketPreviousClose
    : finite(meta.fulldayPrice) && finite(meta.fulldayChange) && Math.abs(meta.fulldayPrice - meta.regularMarketPrice) < .00001
      ? meta.fulldayPrice - meta.fulldayChange : null;
  const high = finite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null;
  const low = finite(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null;
  return { ...spec, price: meta.regularMarketPrice, previousClose, high: high != null && low != null && high < low ? null : high,
    low: high != null && low != null && high < low ? null : low, asOf, date: quoteDate,
    contract: typeof meta.shortName === 'string' ? meta.shortName : spec.name, history,
    source: 'Yahoo Finance', sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(spec.symbol)}/`, stale: false };
}

let cached = null, expires = 0, pending = null;
export async function fetchCommodityDashboard() {
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    const quotes = await Promise.all(COMMODITY_INSTRUMENTS.map(async spec => {
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.symbol)}?range=10y&interval=1d`, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error('Commodity provider unavailable');
        return parseCommodityHistory(await response.json(), spec);
      } catch {
        const previous = cached?.quotes.find(quote => quote?.id === spec.id);
        return previous ? { ...previous, stale: true } : { ...spec, price: null, history: [], stale: true };
      }
    }));
    if (!quotes.some(quote => quote.price != null)) throw new Error('Commodity prices unavailable');
    cached = { quotes };
    expires = Date.now() + (quotes.some(quote => quote.stale) ? 30000 : 120000);
    return cached;
  })().finally(() => { pending = null; });
  return pending;
}
