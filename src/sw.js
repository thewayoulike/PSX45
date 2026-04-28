// We put this in a console.log so the build engine doesn't delete it as "dead sdasdas dasdas"!
console.log("PWA Manifest injected:", self.__WB_MANIFEST);

// --- CRITICAL FIX FOR ANDROID INSTALLATION ---
// Chrome requires a fetch event listener to consider the app a valid PWA.
// Even an empty one like this satisfies the requirement to show the "Install" prompt.
self.addEventListener('fetch', (event) => {
  // Pass through normally
});

self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      vibrate: [200, 100, 200]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
