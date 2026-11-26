// Service worker for the Skill Matrix PWA.
// - Pages (navigations): network first, cached copy when offline.
// - Same-origin static files (css/js/assets): served from cache, refreshed in the background.
// - Anything cross-origin (Supabase API, CDN, fonts) is never touched here.
// Bump VERSION to drop old caches after a big change.
const VERSION = 'v1';
const CACHE = 'skill-matrix-' + VERSION;
const PRECACHE = [
  './auth/login',
  './app',
  './erp',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('skill-matrix-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./auth/login')))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((res) => { if (res.ok) c.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || fresh;
      })
    )
  );
});
