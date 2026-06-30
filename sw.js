/* AUBS service worker — The Good Neighbor Guard
   Strategy:
   - HTML pages (navigations): NETWORK-FIRST, so new code always loads
     when online; falls back to cache only when offline.
   - Icons/manifest (static): cache-first.
   - Cross-origin (model CDN, esm.run, fonts): never intercepted —
     WebLLM caches the model itself.
   Bump CACHE to force clients onto fresh code. */
const CACHE = "aubs-shell-v37";
const STATIC = [
  "./manifest.json","./icon-192.png","./icon-512.png",
  "./apple-touch-icon.png","./favicon.png","./aubs-landing-art.png",
  "./spine/spine.js","./spine/ledger.js",
  // Constitutional runtime (M1–M4) — precached so kernel mode + offline verify work offline.
  "./core/browser-assets.js",
  "./core/cac/validate.js","./core/cac/builders.js","./core/cac/decision-record-adapter.js","./core/cac/index.js",
  "./core/gel/evaluate.js","./core/gel/simulator.js","./core/gel/index.js",
  "./core/kernel/plan-builder.js","./core/kernel/adapters.js","./core/kernel/explanation.js","./core/kernel/execute.js","./core/kernel/index.js","./core/kernel/chat-bridge.js",
  // Full constitutional stack (M5–M14) — precached so the constitutional chat path
  // (?spine=1) and offline replay/audit work fully offline. Topological load order.
  "./core/providers/capabilities.js","./core/providers/drift-shield.js","./core/providers/eligibility.js","./core/providers/registry.js","./core/providers/fake-providers.js","./core/providers/openai-adapter.js","./core/providers/index.js",
  "./core/memory/types.js","./core/memory/store.js","./core/memory/permissions.js","./core/memory/replay-memory.js","./core/memory/service.js","./core/memory/index.js",
  "./core/tools/permissions.js","./core/tools/explanation.js","./core/tools/drift-shield.js","./core/tools/eligibility.js","./core/tools/execute.js","./core/tools/fake-tools.js","./core/tools/registry.js","./core/tools/replay-tool.js","./core/tools/index.js",
  "./core/skills/explanation.js","./core/skills/eligibility.js","./core/skills/execute.js","./core/skills/fake-skills.js","./core/skills/registry.js","./core/skills/replay-skill.js","./core/skills/index.js",
  "./core/planner/graph.js","./core/planner/summary.js","./core/planner/record.js","./core/planner/estimate.js","./core/planner/planner.js","./core/planner/replay-planner.js","./core/planner/index.js",
  "./core/replay/evidence.js","./core/replay/replay-engine.js","./core/replay/index.js",
  // Governed-fact registry (A1/A2) + Trust OS (Layers 1–9) — precached so ?facts=1 / ?trust=1
  // work offline too. Loaded after spine/ledger, before pipeline.js (see aubs-app.html order).
  "./core/facts/registry.js","./core/facts/classifier.js","./core/facts/gate.js","./core/facts/provenance.js","./core/facts/bundle.js",
  // Persona System v1 — personality as owned runtime state (resolve/compile/guard).
  "./core/persona/persona.js",
  // Knowledge Layer — pack registry + lexicon (Pack #1) + definitions (Pack #2). The multi-MB
  // corpora are NOT precached; they are runtime-cached (cache-first) on first use → offline after.
  "./core/knowledge/registry.js","./core/knowledge/lexicon.js","./core/knowledge/definitions.js","./core/knowledge/conversions.js","./core/knowledge/time.js","./core/knowledge/calc.js",
  "./core/trust/strengths.js","./core/trust/hash.js","./core/trust/trust-record.js","./core/trust/memory-types.js","./core/trust/reasoning-permission.js","./core/trust/egress.js","./core/trust/egress-ledger.js","./core/trust/decision-trace.js","./core/trust/check-order.js","./core/trust/proofs/integrity.js","./core/trust/proofs/provenance.js","./core/trust/proofs/grounding.js","./core/trust/proofs/decision.js","./core/trust/proofs/privacy.js","./core/trust/proofs/memory.js","./core/trust/verifier.js","./core/trust/glass-box.js","./core/trust/index.js",
  "./core/constitution/explain.js","./core/constitution/graph.js","./core/constitution/pipeline.js","./core/constitution/audit.js","./core/constitution/index.js","./core/constitution/chat.js",
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
