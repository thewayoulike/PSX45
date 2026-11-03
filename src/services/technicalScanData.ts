import { fetchIntradayOHLCV, fetchOHLCV, type OhlcBar } from './psxData';

// Public market candles only, held in memory for five minutes. Requests for the same
// symbol share a promise; failed/empty responses remain retryable. No new storage.
const cache = new Map<string, { at: number; promise: Promise<OhlcBar[]> }>();
export function fetchTechnicalScanBars(symbol: string): Promise<OhlcBar[]> {
  const key = symbol.trim().toUpperCase(), now = Date.now();
  const existing = cache.get(key);
  if (existing && now - existing.at < 300000) return existing.promise;
  const promise = fetchOHLCV(key).then(bars => {
    if (!bars.length) cache.delete(key);
    return bars;
  }, error => { cache.delete(key); throw error; });
  if (cache.size >= 600) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: now, promise });
  return promise;
}

// Hourly candles for the timeframe check, one symbol at a time. Same five-minute memory
// cache; failures resolve to [] so the daily and weekly frames still show.
const hourlyCache = new Map<string, { at: number; promise: Promise<OhlcBar[]> }>();
export function fetchHourlyBars(symbol: string): Promise<OhlcBar[]> {
  const key = symbol.trim().toUpperCase(), now = Date.now();
  const existing = hourlyCache.get(key);
  if (existing && now - existing.at < 300000) return existing.promise;
  const promise = fetchIntradayOHLCV(key, '1h', '1mo').catch(() => [] as OhlcBar[]).then(bars => {
    if (!bars.length) hourlyCache.delete(key);
    return bars;
  });
  if (hourlyCache.size >= 100) hourlyCache.delete(hourlyCache.keys().next().value!);
  hourlyCache.set(key, { at: now, promise });
  return promise;
}
