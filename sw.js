/* AUBS service worker — The Good Neighbor Guard
   Strategy:
   - HTML pages (navigations): NETWORK-FIRST, so new code always loads
     when online; falls back to cache only when offline.
   - Icons/manifest (static): cache-first.
   - Cross-origin (model CDN, esm.run, fonts): never intercepted —
     WebLLM caches the model itself.
   Bump CACHE to force clients onto fresh code. */
const CACHE = "aubs-shell-v3";
const STATIC = [
  "./manifest.json","./icon-192.png","./icon-512.png",
  "./apple-touch-icon.png","./favicon.png","./aubs-landing-art.png"
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

  // HTML / navigations → network-first (always get latest code online)
  const isHTML = req.mode === "navigate" || req.destination === "document" || url.pathname.endsWith(".html");
  if (isHTML) {
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
