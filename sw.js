/* AUBS service worker — The Good Neighbor Guard
   Caches only the local app shell so AUBS opens offline.
   It deliberately does NOT touch cross-origin requests
   (esm.run, model CDN, Google Fonts) — WebLLM handles model
   caching itself, and intercepting those would break downloads. */
const CACHE = "aubs-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./aubs-app.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./aubs-landing-art.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GET. Everything else (model CDN, fonts, esm.run)
  // goes straight to the network, untouched.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
