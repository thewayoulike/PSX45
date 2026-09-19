// Only public, same-origin market GETs belong here. Never cache account/Drive calls.
const cached = new Map<string, { until: number; response: Response }>();
const running = new Map<string, Promise<Response>>();
let pythonActive = 0;
const pythonQueue: (() => void)[] = [];
let pythonCooldown: { until: number; response: Response } | undefined;
async function requestPython(request: () => Promise<Response>) {
  if (pythonActive >= 2) await new Promise<void>(resolve => pythonQueue.push(resolve));
  else pythonActive++;
  try {
    if (pythonCooldown && pythonCooldown.until > Date.now()) return pythonCooldown.response.clone();
    return await request();
  } finally {
    const next = pythonQueue.shift();
    if (next) next(); else pythonActive--;
  }
}
export function marketCacheLifetime(url: string) {
  if (!/^\/api\/(?:proxy|pypsx)\?/.test(url)) return 0;
  const q = new URL(url, 'https://market.invalid').searchParams;
  if (q.has('force')) return 0;
  if (q.get('mode') === 'indices') return 6 * 60 * 60 * 1000;
  if (['dividends', 'company'].includes(q.get('mode') || '')) return 5 * 60 * 1000;
  if (q.has('ohlc') || q.has('analysis') || q.get('mode') === 'history') return 5 * 60 * 1000;
  return q.get('mode')?.startsWith('quote') ? 15000 : 60000;
}
export async function cachedMarketFetch(url: string, request: () => Promise<Response>): Promise<Response> {
  const ttl = marketCacheLifetime(url);
  if (!ttl) return request();
  const hit = cached.get(url);
  if (hit && hit.until > Date.now()) return hit.response.clone();
  let promise = running.get(url);
  if (!promise) {
    const python = url.startsWith('/api/pypsx?');
    const perform = async () => {
      const response = await request();
      // Fully buffer once: cloned streaming bodies otherwise accumulate during polling.
      const bytes = await response.arrayBuffer();
      const reusable = new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      const temporaryFailure = [429, 502, 503, 504].includes(response.status);
      const retryHeader = response.headers.get('Retry-After');
      const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : retryHeader ? (Date.parse(retryHeader) - Date.now()) / 1000 : 60;
      const pause = Math.max(1000, Math.min(300000, Number.isFinite(seconds) ? seconds * 1000 : 60000));
      if (python && [429, 503].includes(response.status)) pythonCooldown = { until: Date.now() + pause, response: reusable };
      const validContent = !python || /json/i.test(response.headers.get('Content-Type') || '');
      if (((response.ok && validContent) || temporaryFailure) && bytes.byteLength < 2_000_000) {
        cached.delete(url);
        cached.set(url, { until: Date.now() + (temporaryFailure ? pause : ttl), response: reusable });
        while (cached.size > 24) cached.delete(cached.keys().next().value!);
      }
      return reusable;
    };
    promise = (python ? requestPython(perform) : perform()).finally(() => running.delete(url));
    running.set(url, promise);
  }
  return (await promise).clone();
}
export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
