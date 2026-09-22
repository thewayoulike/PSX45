import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  routes: [] as any[], order: [] as string[], network: vi.fn(), offline: vi.fn(), listeners: {} as Record<string, Function>,
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
  NetworkFirst: class { handle = mocks.network; }, CacheFirst: class {},
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
it('keeps APIs, assets and public guide pages outside the app navigation fallback', () => {
  const deny = mocks.routes[0].options.denylist as RegExp[];
  for (const path of ['/api/cloud-sync', '/assets/deleted.js', '/how-to-use', '/privacy']) expect(deny.some(re => re.test(path))).toBe(true);
  expect(deny.some(re => re.test('/holdings'))).toBe(false);
});
