/**
 * KILL SWITCH Service Worker
 * ────────────────────────────────────────
 * This completely unregisters the service worker and clears all its caches
 * because the old service worker was trapping Capacitor apps in the past.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW Kill Switch] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      self.registration.unregister().then(() => {
        console.log('[SW Kill Switch] Unregistered completely.');
      });
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Do nothing, pass through to network
  return;
});
