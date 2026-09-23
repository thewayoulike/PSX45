import { precache, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { recoveryActivationStatus } from './utils/swRecovery';

// Use the manifest injected at build time -> real offline caching.
precache(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();
const navigation = new NetworkFirst({
  cacheName: 'psx-navigation-v1', networkTimeoutSeconds: 3, fetchOptions: { cache: 'no-cache' },
  plugins: [{ cacheWillUpdate: async ({ response }) => response.status === 200 && /text\/html/i.test(response.headers.get('Content-Type') || '') ? response : null },
    new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 7 * 86400 })],
});
// Register before the precache route: an online refresh must request the current HTML,
// rather than pinning '/' or '/index.html' to a previous deployment's module names.
registerRoute(new NavigationRoute(async (context) => {
  try {
    const response = await navigation.handle(context);
    if (response && response.ok && /text\/html/i.test(response.headers.get('Content-Type') || '')) return response;
  } catch { /* Network and runtime cache unavailable: use the installed offline shell. */ }
  return createHandlerBoundToURL('/index.html')(context);
}, { denylist: [/^\/(?:api|assets|fonts|media)\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/, /^\/llms\.txt$/, /^\/(about|privacy|terms|contact|guides|how-to-use|how-it-works|markets|tools)(\/|$)/] }));
addRoute();
registerRoute(({ request, url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/') && request.destination === 'script',
  new CacheFirst({ cacheName: 'psx-tools-v1', plugins: [{
    cacheWillUpdate: async ({ response }) => response.status === 200 && /(?:java|ecma)script/i.test(response.headers.get('Content-Type') || '') ? response : null,
    cachedResponseWillBeUsed: async ({ cachedResponse }) => cachedResponse && /(?:java|ecma)script/i.test(cachedResponse.headers.get('Content-Type') || '') ? cachedResponse : null,
  }, new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 86400 })] }));

// Let an update activate after existing app tabs close, so an active edit is not
// moved between application versions. First installation still activates normally.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'PSX_RECOVER_VERSION') return;
  event.waitUntil((async () => {
    try {
      const status = await recoveryActivationStatus(self, event.source?.id);
      event.ports[0]?.postMessage({ status });
      if (status === 'activating') await self.skipWaiting();
    } catch { event.ports[0]?.postMessage({ status: 'unavailable' }); }
  })());
});

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/pwa-premium-192.png',
    badge: '/notification-badge-premium.png',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
