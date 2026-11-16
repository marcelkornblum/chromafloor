/**
 * ChromaFloor Service Worker
 * Festival-proof offline caching & instant launch in zero-bar crowds.
 * Uses relative paths so it functions identically under GitHub Pages subpaths.
 */

const CACHE_NAME = 'chromafloor-v8';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './setup.html',
  './styles.css',
  './manifest.json',
  './favicon.svg',
  './js/color-engine.js',
  './js/url-state.js',
  './js/live-sync.js',
  './js/qr.js',
  './js/share-app.js',
  './js/setup-app.js'
];

// Install: Cache all static app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: Clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: Stale-while-revalidate / Network-first fallback
// Prioritizes network for fresh code while guaranteeing offline festival access
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore cross-origin font/analytics requests or chrome-extension protocols
  if (url.origin !== self.location.origin) {
    // For external fonts (Google Fonts), try cache then fallback to network
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Gracefully ignore font network errors in zero-connectivity
          return new Response('', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // Same-origin app shell files: Network-first with instant cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline or connection timed out: Return cached version
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigating to root, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline: Content not cached', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});
