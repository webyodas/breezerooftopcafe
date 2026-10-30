/* ==========================================================================
   BREEZE CAFE & FLEET — LIVE-SYNC PROGRESSIVE WEB APP SERVICE WORKER
   Strategy: Network-First for HTML/Code (Zero Stale Versions), Realtime Bypass,
   Immediate Activation (skipWaiting + clients.claim), and Resilient Offline Fallback
   ========================================================================== */

const CACHE_VERSION = 'breeze-pwa-v1.0.7-webyodas-link';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Essential shell assets cached on install for offline launch
const PRECACHE_ASSETS = [
  '/',
  '/rider/',
  '/admin/',
  '/offline.html',
  '/favicon.ico',
  '/assets/logo-emblem.png',
  '/assets/logo-transparent.png',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/rider-192.png',
  '/assets/pwa/admin-192.png',
  '/css/style.css',
  '/manifest.json',
  '/manifest-rider.json',
  '/manifest-admin.json'
];

// Install Event: Cache essential shell and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Take over immediately without waiting for existing tabs to close
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Breeze PWA] Pre-cache partial warning:', err);
      });
    })
  );
});

// Activate Event: Wipe obsolete caches and take control of all active clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => {
            console.log('[Breeze PWA] Purging outdated cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. NEVER intercept Supabase Realtime, REST API, Razorpay, or Google Auth
  // Must always stream live from the network
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('razorpay.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    req.method !== 'GET'
  ) {
    return; // Pass through directly to network
  }

  // 2. Navigation Requests (HTML Pages like /, /rider, /admin) -> NETWORK-FIRST
  // This guarantees that any code update, price change, or deployment is immediately seen!
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          // If offline, serve from runtime cache or static shell
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('/offline.html');
          return fallback || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // 3. Application Scripts & Stylesheets (admin.js, rider.js, app.js, style.css) -> NETWORK-FIRST
  // Guarantees that script bug fixes and style updates are loaded fresh from the server
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. Static Images, Logos, and Fonts -> STALE-WHILE-REVALIDATE
  // Fast loading from cache, background refresh from network
  if (req.destination === 'image' || req.destination === 'font') {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
            }
            return networkRes;
          })
          .catch(() => null);

        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  // Default fallback for other GET requests
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
