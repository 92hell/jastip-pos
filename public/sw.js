/*
 * Titip Laili Yuk service worker: makes the app installable and keeps the shopping lists usable
 * without signal. Deliberately small and hand-written so every rule is visible:
 * - The app's code and styles (/_next/static, fonts, icons) never change under a name: cache-first.
 * - Shopping-list pages (/id|en/events/<id>/shopping): network-first, with the last good copy kept,
 *   so a list opened once with signal opens again without it.
 * - Any other page: network only; without signal, the offline page (which links to saved lists).
 * - Nothing else (POSTs, API calls, invoices, receipt photos) is ever stored.
 * Signing out sends "clear", which deletes the saved pages.
 */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE = "/offline.html";
const SHOPPING = /^\/(id|en)\/events\/\d+\/shopping$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(STATIC).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  if (SHOPPING.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page: not a redirect to sign-in, not an error. waitUntil keeps the worker
          // alive until the copy is stored (the page itself is answered at once).
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            event.waitUntil(caches.open(PAGES).then((cache) => cache.put(url.pathname, copy)));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname, { cacheName: PAGES }).then((hit) => hit || caches.match(OFFLINE))),
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
});
