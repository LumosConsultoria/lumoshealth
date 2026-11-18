// Only non-sensitive public shell files may be stored for offline preview.
const CACHE_NAME = "lumos-health-shell-v2";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept clinical APIs, authentication, cross-origin requests,
  // query-bearing URLs or any content outside the explicit public allowlist.
  if (url.origin !== self.location.origin || !SHELL.includes(url.pathname) || url.search) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const cacheControl = response.headers.get("cache-control") ?? "";
        if (response.ok && !/\b(no-store|private)\b/i.test(cacheControl)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
