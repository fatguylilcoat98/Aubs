/* AUBS service worker — The Good Neighbor Guard
   Strategy:
   - HTML pages (navigations): NETWORK-FIRST, so new code always loads
     when online; falls back to cache only when offline.
   - Icons/manifest (static): cache-first.
   - Cross-origin (model CDN, esm.run, fonts): never intercepted —
     WebLLM caches the model itself.
   Bump CACHE to force clients onto fresh code. */
const CACHE = "aubs-shell-v12";
const STATIC = [
  "./manifest.json","./icon-192.png","./icon-512.png",
  "./apple-touch-icon.png","./favicon.png","./aubs-landing-art.png",
  "./spine/spine.js",
  "./fonts.css",
  "./fonts/inter-400.woff2","./fonts/inter-500.woff2","./fonts/inter-600.woff2",
  "./fonts/space-grotesk-400.woff2","./fonts/space-grotesk-500.woff2",
  "./fonts/space-grotesk-600.woff2","./fonts/space-grotesk-700.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k)=>k!==CACHE).map((k)=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // leave model CDN alone

  // Code (HTML + our JS, e.g. spine.js) → network-first so the app and the spine
  // always update TOGETHER when online (cache-first on spine.js previously let a
  // fresh HTML run against a stale spine). Falls back to cache when offline.
  const isCode = req.mode === "navigate" || req.destination === "document"
    || url.pathname.endsWith(".html") || url.pathname.endsWith(".js");
  if (isCode) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./aubs-app.html")))
    );
    return;
  }
  // static assets → cache-first
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c)=>c.put(req,copy)).catch(()=>{});
      return res;
    }))
  );
});
