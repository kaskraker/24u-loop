// Service Worker for 24u Loop Leuven PWA
const CACHE_NAME = '24u-loop-v6';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './water-for-all-logo.png',
  './atlas-copco-logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdn.tailwindcss.com',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app resources');
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })))
          .catch(err => {
            console.warn('⚠️ Some resources failed to cache:', err);
            // Cache what we can, continue anyway
            return Promise.all(
              urlsToCache.map(url => 
                cache.add(url).catch(e => console.warn(`Failed to cache ${url}:`, e))
              )
            );
          });
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase requests - always go to network
  if (event.request.url.includes('firebasedatabase.app') || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  // De app-pagina zelf: netwerk eerst (je krijgt altijd de nieuwste versie), met de bewaarde versie als
  // terugval wanneer je offline bent of de verbinding te traag is (4 s). Werkt voor elke ?mode=... variant.
  const reqUrl = new URL(event.request.url);
  const isAppPage = event.request.mode === 'navigate' &&
    (reqUrl.pathname.endsWith('/') || reqUrl.pathname.endsWith('/index.html'));
  if (isAppPage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const net = await Promise.race([
          fetch(event.request),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);
        if (net && net.status === 200) {
          cache.put('./index.html', net.clone());   // altijd de laatste goede versie bewaren
        }
        return net;
      } catch (err) {
        const cached = await cache.match('./index.html') || await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        return new Response(
          '<html><body><h1>Offline</h1><p>Je bent offline en deze pagina is nog niet bewaard. Open hem eerst één keer met internet.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          // Update cache in background for next time
          fetch(event.request).then(fetchResponse => {
            if (fetchResponse && fetchResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, fetchResponse);
              });
            }
          }).catch(() => {
            // Network failed, but we have cache - that's fine
          });
          return response;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(fetchResponse => {
          // Don't cache if not a valid response
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type === 'error') {
            return fetchResponse;
          }

          // Clone the response (can only be consumed once)
          const responseToCache = fetchResponse.clone();

          // Add to cache for future use
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return fetchResponse;
        }).catch(error => {
          console.log('🔌 Offline - failed to fetch:', event.request.url);
          
          // Return a basic offline page for HTML requests
          if (event.request.headers.get('accept').includes('text/html')) {
            return new Response(
              '<html><body><h1>Offline</h1><p>Je bent offline. De app werkt weer zodra je verbinding herstelt.</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
          
          throw error;
        });
      })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
