import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  routes: [] as any[], order: [] as string[], network: vi.fn(), offline: vi.fn(), listeners: {} as Record<string, Function>,
  assetOptions: {} as any,
}));
vi.mock('workbox-precaching', () => ({
  precache: () => {}, cleanupOutdatedCaches: () => {},
  addRoute: () => mocks.order.push('precache-route'),
  createHandlerBoundToURL: () => mocks.offline,
}));
vi.mock('workbox-routing', () => ({
  registerRoute: (route: unknown) => { mocks.routes.push(route); mocks.order.push('route'); },
  NavigationRoute: class { constructor(public handler: Function, public options: any) {} },
}));
vi.mock('workbox-strategies', () => ({
  CacheFirst: class { constructor(options: any) { mocks.assetOptions = options; } },
}));
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }));
beforeEach(async () => {
  vi.resetModules(); mocks.routes.length = 0; mocks.order.length = 0; mocks.network.mockReset(); mocks.offline.mockReset();
  vi.stubGlobal('self', { __WB_MANIFEST: [], addEventListener: (type: string, fn: Function) => { mocks.listeners[type] = fn; } });
  vi.stubGlobal('fetch', mocks.network);
  await import('../sw.js');
});
afterEach(() => vi.unstubAllGlobals());
it('serves the current network HTML before any precached index route', async () => {
  const current = new Response('<script src="/assets/new-release.js"></script>', { headers: { 'Content-Type': 'text/html' } });
  mocks.network.mockResolvedValue(current);
  expect(mocks.order.indexOf('route')).toBeLessThan(mocks.order.indexOf('precache-route'));
  expect(await mocks.routes[0].handler({ request: {} })).toBe(current);
  expect(mocks.offline).not.toHaveBeenCalled();
});
it('keeps the installed offline shell when the network and navigation cache are unavailable', async () => {
  const fallback = new Response('offline portfolio shell');
  mocks.network.mockRejectedValue(new Error('offline')); mocks.offline.mockResolvedValue(fallback);
  expect(await mocks.routes[0].handler({ request: {} })).toBe(fallback);
});
it('does not show an upstream error or JSON response as the app shell', async () => {
  const fallback = new Response('installed shell'); mocks.offline.mockResolvedValue(fallback);
  mocks.network.mockResolvedValue(new Response('maintenance', { status: 503, headers: { 'Content-Type': 'text/html' } }));
  expect(await mocks.routes[0].handler({})).toBe(fallback);
  mocks.network.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  expect(await mocks.routes[0].handler({})).toBe(fallback);
});
it.each([200, 403, 429])('shows a hosting challenge with status %s instead of hiding it behind the installed shell', async (status) => {
  const challenge = new Response('<html>Complete the security check</html>', {
    status, headers: { 'Content-Type': 'text/html', 'x-vercel-mitigated': 'challenge' },
  });
  mocks.network.mockResolvedValue(challenge);
  expect(await mocks.routes[0].handler({ request: {} })).toBe(challenge);
  expect(mocks.offline).not.toHaveBeenCalled();
});
it('falls back to the installed shell when the page is slower than 3 seconds', async () => {
  vi.useFakeTimers();
  const fallback = new Response('installed shell'); mocks.offline.mockResolvedValue(fallback);
  mocks.network.mockImplementation((_req: unknown, init: RequestInit) => new Promise((_, reject) =>
    init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const pending = mocks.routes[0].handler({ request: {} });
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toBe(fallback);
  vi.useRealTimers();
});
it('never serves page HTML stored by an earlier worker', async () => {
  const deleted: string[] = [];
  vi.stubGlobal('caches', { delete: vi.fn(async (name: string) => { deleted.push(name); return true; }) });
  (self as any).clients = { claim: vi.fn(async () => {}) };
  let done!: Promise<unknown>;
  mocks.listeners.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  expect(deleted).toContain('psx-navigation-v1');
});
it('reuses an open app window for a notification tap instead of opening another', async () => {
  const app = { url: 'https://www.psx-tracker.com/holdings', focus: vi.fn(async () => app) };
  const guide = { url: 'https://www.psx-tracker.com/guides/x', focus: vi.fn() };
  const openWindow = vi.fn();
  (self as any).clients = { matchAll: vi.fn(async () => [guide, app]), openWindow };
  let done!: Promise<unknown>;
  mocks.listeners.notificationclick({ notification: { close: vi.fn() }, waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  expect(app.focus).toHaveBeenCalled(); expect(guide.focus).not.toHaveBeenCalled(); expect(openWindow).not.toHaveBeenCalled();
  (self as any).clients.matchAll = vi.fn(async () => [guide]);
  mocks.listeners.notificationclick({ notification: { close: vi.fn() }, waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  expect(openWindow).toHaveBeenCalledWith('/');
});
it('shows a plain-text push instead of failing on it', async () => {
  const showNotification = vi.fn(async () => {});
  (self as any).registration = { showNotification };
  let done!: Promise<unknown>;
  mocks.listeners.push({ data: { json: () => { throw new SyntaxError('bad'); }, text: () => 'Price alert: OGDC' }, waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  expect(showNotification).toHaveBeenCalledWith('PSX Tracker', expect.objectContaining({ body: 'Price alert: OGDC' }));
});
it('keeps APIs, assets and public guide pages outside the app navigation fallback', () => {
  const deny = mocks.routes[0].options.denylist as RegExp[];
  for (const path of ['/api/cloud-sync', '/assets/deleted.js', '/how-to-use', '/privacy', '/guides/start-investing-on-psx', '/markets/shares/ogdc.html']) expect(deny.some(re => re.test(path))).toBe(true);
  expect(deny.some(re => re.test('/holdings'))).toBe(false);
});
it('caches the projection worker after use without caching unrelated requests', () => {
  vi.stubGlobal('self', { location: { origin: 'https://www.psx-tracker.com' } });
  const match = mocks.routes[1];
  expect(match({ request: { destination: 'worker' }, url: new URL('https://www.psx-tracker.com/assets/chartProjection.worker-test.js') })).toBe(true);
  expect(match({ request: { destination: 'worker' }, url: new URL('https://example.com/assets/worker.js') })).toBe(false);
  expect(match({ request: { destination: 'script' }, url: new URL('https://www.psx-tracker.com/api/proxy') })).toBe(false);
});
it('serves a script deleted by a newer release from any cache that still holds it', async () => {
  const kept = new Response('export const form = 1;', { headers: { 'Content-Type': 'text/javascript' } });
  const match = vi.fn().mockResolvedValue(kept);
  vi.stubGlobal('caches', { match });
  const plugin = mocks.assetOptions.plugins[0];
  const request = { url: 'https://www.psx-tracker.com/assets/DashboardGrid-old.js' };
  expect(await plugin.fetchDidSucceed({ request, response: new Response('Not found', { status: 404 }) })).toBe(kept);
  expect(match).toHaveBeenCalledWith(request.url, { ignoreSearch: true });
  const missing = new Response('Not found', { status: 404 });
  match.mockResolvedValue(undefined);
  expect(await plugin.fetchDidSucceed({ request, response: missing })).toBe(missing);
  const current = new Response('export {}', { headers: { 'Content-Type': 'text/javascript' } });
  match.mockClear();
  expect(await plugin.fetchDidSucceed({ request, response: current })).toBe(current);
  expect(match).not.toHaveBeenCalled();
});
