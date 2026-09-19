// Only public, same-origin market GETs belong here. Never cache account/Drive calls.
const cached = new Map<string, { until: number; response: Response }>();
const running = new Map<string, Promise<Response>>();
export function marketCacheLifetime(url: string) {
  if (!/^\/api\/(?:proxy|pypsx)\?/.test(url)) return 0;
  const q = new URL(url, 'https://market.invalid').searchParams;
  if (q.has('force')) return 0;
  if (q.get('mode') === 'indices') return 6 * 60 * 60 * 1000;
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
    promise = request().then(async response => {
      // Fully buffer once: cloned streaming bodies otherwise accumulate during polling.
      const bytes = await response.arrayBuffer();
      const reusable = new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      if (response.ok && bytes.byteLength < 2_000_000) {
        cached.delete(url);
        cached.set(url, { until: Date.now() + ttl, response: reusable });
        while (cached.size > 24) cached.delete(cached.keys().next().value!);
      }
      return reusable;
    }).finally(() => running.delete(url));
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
