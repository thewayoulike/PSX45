import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  routes: [] as any[], order: [] as string[], network: vi.fn(), offline: vi.fn(), listeners: {} as Record<string, Function>,
  navigationOptions: {} as any,
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
  NetworkFirst: class { constructor(options: any) { mocks.navigationOptions = options; } handle = mocks.network; }, CacheFirst: class {},
}));
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }));
beforeEach(async () => {
  vi.resetModules(); mocks.routes.length = 0; mocks.order.length = 0; mocks.network.mockReset(); mocks.offline.mockReset();
  vi.stubGlobal('self', { __WB_MANIFEST: [], addEventListener: (type: string, fn: Function) => { mocks.listeners[type] = fn; } });
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
it('never adds a hosting challenge to the navigation cache, even if it uses status 200', async () => {
  const plugin = mocks.navigationOptions.plugins[0];
  const challenge = new Response('<html>Complete the security check</html>', {
    headers: { 'Content-Type': 'text/html', 'x-vercel-mitigated': 'challenge' },
  });
  expect(await plugin.cacheWillUpdate({ response: challenge })).toBeNull();
  const shell = new Response('<html>Current portfolio shell</html>', { headers: { 'Content-Type': 'text/html' } });
  expect(await plugin.cacheWillUpdate({ response: shell })).toBe(shell);
});
it('ignores a previously cached challenge while preserving the valid offline shell', async () => {
  const plugin = mocks.navigationOptions.plugins[0];
  const cachedChallenge = new Response('<html>Expired security check</html>', {
    headers: { 'Content-Type': 'text/html', 'x-vercel-mitigated': 'challenge' },
  });
  expect(await plugin.cachedResponseWillBeUsed({ cachedResponse: cachedChallenge })).toBeNull();
  const shell = new Response('<html>Saved portfolio shell</html>', { headers: { 'Content-Type': 'text/html' } });
  expect(await plugin.cachedResponseWillBeUsed({ cachedResponse: shell })).toBe(shell);
  expect(await plugin.cachedResponseWillBeUsed({ cachedResponse: undefined })).toBeUndefined();
});
it('keeps APIs, assets and public guide pages outside the app navigation fallback', () => {
  const deny = mocks.routes[0].options.denylist as RegExp[];
  for (const path of ['/api/cloud-sync', '/assets/deleted.js', '/how-to-use', '/privacy']) expect(deny.some(re => re.test(path))).toBe(true);
  expect(deny.some(re => re.test('/holdings'))).toBe(false);
});
it('caches the projection worker after use without caching unrelated requests', () => {
  vi.stubGlobal('self', { location: { origin: 'https://www.psx-tracker.com' } });
  const match = mocks.routes[1];
  expect(match({ request: { destination: 'worker' }, url: new URL('https://www.psx-tracker.com/assets/chartProjection.worker-test.js') })).toBe(true);
  expect(match({ request: { destination: 'worker' }, url: new URL('https://example.com/assets/worker.js') })).toBe(false);
  expect(match({ request: { destination: 'script' }, url: new URL('https://www.psx-tracker.com/api/proxy') })).toBe(false);
});
