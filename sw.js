/**
 * Vault Service Worker — offline-first caching for local deployment.
 *
 * Strategy:
 *   /assets/*  — cache-first (Vite content-hashed static files never change)
 *   /api/*     — network-only (never intercept backend calls)
 *   everything else — network-first, cache as offline fallback
 */

const CACHE_VERSION = 'vault-sw-v3';

// On install, take control immediately without waiting for old tabs to close.
self.addEventListener('install', () => self.skipWaiting());

// On activate, delete stale caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls, health checks, or SSE streams.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/health/')
  ) return;

  // Cache-first for content-hashed Vite build assets (/assets/*).
  // These filenames include a content hash so they are safe to serve from cache forever.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Network-first for HTML, manifests and other navigations.
  // Serves from cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
