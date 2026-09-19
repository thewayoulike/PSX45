import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Use the manifest injected at build time -> real offline caching.
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/(?:api|assets|fonts|media)\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/, /^\/(about|privacy|terms|contact|guides|how-to-use|how-it-works)(\/|$)/] }));
registerRoute(({ request, url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/') && request.destination === 'script',
  new CacheFirst({ cacheName: 'psx-tools-v1', plugins: [{
    cacheWillUpdate: async ({ response }) => response.status === 200 && /(?:java|ecma)script/i.test(response.headers.get('Content-Type') || '') ? response : null,
    cachedResponseWillBeUsed: async ({ cachedResponse }) => cachedResponse && /(?:java|ecma)script/i.test(cachedResponse.headers.get('Content-Type') || '') ? cachedResponse : null,
  }, new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 86400 })] }));

// Let an update activate after existing app tabs close, so an active edit is not
// moved between application versions. First installation still activates normally.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
