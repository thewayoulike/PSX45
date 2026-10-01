import { precache, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { recoveryActivationStatus, PUBLIC_PAGE } from './utils/swRecovery';

// Use the manifest injected at build time -> real offline caching.
precache(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();
const isHostingChallenge = (response) => response?.headers.get('x-vercel-mitigated') === 'challenge';
const offlineShell = createHandlerBoundToURL('/index.html');
// Page HTML is never cached separately: a stored page from an older release points at files
// that release's deploy has since deleted, and the app would stay blank on slow networks.
// The precached shell always matches the files this worker holds.
registerRoute(new NavigationRoute(async (context) => {
  try {
    // Abort only while waiting for headers, so a page that starts arriving finishes downloading.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(context.request, { cache: 'no-cache', signal: controller.signal }).finally(() => clearTimeout(timer));
    // Let the browser complete the hosting check even when it returns 403/429.
    // Falling back to the app here hides the check while its API calls stay blocked.
    if (isHostingChallenge(response)) return response;
    if (response.ok && /text\/html/i.test(response.headers.get('Content-Type') || '')) return response;
  } catch { /* Offline or slower than 3 s: use the installed shell. */ }
  return offlineShell(context);
}, { denylist: [/^\/(?:api|assets|fonts|media)\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/, /^\/llms\.txt$/, PUBLIC_PAGE] }));
addRoute();
registerRoute(({ request, url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/') && (request.destination === 'script' || request.destination === 'worker'),
  new CacheFirst({ cacheName: 'psx-tools-v1', plugins: [{
    cacheWillUpdate: async ({ response }) => response.status === 200 && /(?:java|ecma)script/i.test(response.headers.get('Content-Type') || '') ? response : null,
    cachedResponseWillBeUsed: async ({ cachedResponse }) => cachedResponse && /(?:java|ecma)script/i.test(cachedResponse.headers.get('Content-Type') || '') ? cachedResponse : null,
    // A newer release deleted this file. A page from that release may still be open, and an
    // installed-but-waiting worker may already hold its files, so look in every cache first.
    fetchDidSucceed: async ({ request, response }) => response.status === 404 ? (await caches.match(request.url, { ignoreSearch: true })) || response : response,
  }, new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 86400 })] }));

// Let an update activate after existing app tabs close, so an active edit is not
// moved between application versions. First installation still activates normally.
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([
  self.clients.claim(),
  // Pages stored by earlier workers reference files that no longer exist.
  caches.delete('psx-navigation-v1'),
])));
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
  let data;
  try { data = event.data.json(); } catch { data = { title: 'PSX Tracker', body: event.data.text() }; }
  const options = {
    body: data.body,
    icon: '/pwa-premium-192.png',
    badge: '/notification-badge-premium.png',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(data.title || 'PSX Tracker', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  // Reuse an open app window: each extra window keeps an update waiting.
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(client => !PUBLIC_PAGE.test(new URL(client.url).pathname));
    if (app) return app.focus();
    return self.clients.openWindow('/');
  })());
});
