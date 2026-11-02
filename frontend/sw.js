// SpendStory Service Worker v2.2
const CACHE_NAME = "spendstory-v2.2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js?v=2.2",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// ============================================================
// INSTALL — cache the app shell
// ============================================================
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => {
      // Activate immediately without waiting for existing tabs to close
      return self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE — purge old caches
// ============================================================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — Network-first for API calls, Cache-first for assets
// ============================================================
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Always go network-first for API requests (never serve stale financial data)
  const isApiRequest =
    event.request.method !== "GET" ||
    url.pathname.startsWith("/expenses") ||
    url.pathname.startsWith("/families") ||
    url.pathname.startsWith("/me") ||
    url.pathname.startsWith("/health");

  if (isApiRequest) {
    // Pass API requests straight to the network — no caching
    event.respondWith(fetch(event.request));
    return;
  }

  // For app shell assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful same-origin GET responses
        if (
          response &&
          response.status === 200 &&
          response.type === "basic" &&
          event.request.method === "GET"
        ) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // If offline and no cache hit, return the cached index.html as fallback
        return caches.match("/index.html");
      });
    })
  );
});

