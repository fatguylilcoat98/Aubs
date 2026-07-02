/* AUBS memory recall — END-TO-END through the REAL phone build (device finding, July 2026).
   Live test showed extraction worked (counter went to 2) but recall answered as if no
   memories existed. Root cause: identityGuard (spine.js clause (c)) rewrote the runtime's
   own governed-fact recall answer ("Your name is Chris" → "I don't know your name yet")
   because resolvedIdentity().userName comes from SETTINGS, and a name stated in CHAT never
   reached S.userName.

   This boots aubs-app.html's REAL inline module script (webllm stubbed) in a vm sandbox —
   the same technique as run-trust-browser-sim.cjs — and proves the full loop:
     session A: state facts in chat → stored + governed user_name synced + counter correct
     session B (new session, same storage): "what do you know about me?" reflects them,
                "what's my name?" answers from the governed fact, un-mangled by any guard
     counter/clear/storage: all three read the same stored list — never disagree.
   Usage: node tests/run-memory-recall-e2e.cjs   (exit 0 = all pass) */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const html = fs.readFileSync(path.join(ROOT, "aubs-app.html"), "utf8");
const srcs = []; let m; const re = /<script src="([^"]+)"><\/script>/g;
while ((m = re.exec(html)) !== null) srcs.push(m[1]);
const localSrcs = srcs.filter(s => !/^https?:/.test(s) && fs.existsSync(path.join(ROOT, s)));

const MODULE_SRC = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^import \* as webllm from "[^"]*";/m, 'const webllm = { CreateMLCEngine: async () => FAKE_ENGINE };')
  .replace('let engine=null, chosenModel=null', 'let engine=FAKE_ENGINE, chosenModel="sim-0.5B"');

function makeEl() {
  const el = {
    style: { setProperty() {} }, dataset: {}, children: [], _text: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { el.children.push(c); return c; }, remove() {}, focus() {},
    addEventListener() {}, setAttribute() {},
    querySelector() { return el._bubble || (el._bubble = makeEl()); }, querySelectorAll: () => [],
    scrollTop: 0, scrollHeight: 0, value: "", disabled: false,
  };
  Object.defineProperty(el, "textContent", { get() { return el._text; }, set(v) { el._text = String(v); } });
  Object.defineProperty(el, "innerHTML", { get() { return ""; }, set(v) {} });
  return el;
}

function makeLocalStorage(store) {
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; },
  };
}

// Boot one "session": load every external script + the real inline module against `store`.
async function bootSession(store) {
  const els = {};
  const doc = {
    getElementById: (id) => (els[id] || (els[id] = makeEl())),
    querySelector: () => makeEl(), querySelectorAll: () => [],
    createElement: () => makeEl(), addEventListener() {},
    head: makeEl(), body: makeEl(), documentElement: { style: { setProperty() {} }, setAttribute() {} },
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },   // keep suite output readable
    crypto: require("crypto").webcrypto, TextEncoder, TextDecoder, Buffer,
    setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    performance: { now: () => 0 }, navigator: { userAgent: "sim", gpu: undefined },
    location: { search: "", href: "http://localhost/", hostname: "localhost", reload() {} },
    document: doc, localStorage: makeLocalStorage(store), indexedDB: undefined,
    confirm: () => true, alert() {},
    FAKE_ENGINE: { chat: { completions: { create: async () => ({ choices: [{ message: { content: "Okay!" }, finish_reason: "stop" }] }) } } },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const rel of localSrcs) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
  vm.runInContext(`(async () => { ${MODULE_SRC} \n})().catch(e => { globalThis.__moduleError = e && e.message; })`, sandbox, { filename: "aubs-app-inline" });
  await new Promise(r => setTimeout(r, 250));
  if (sandbox.__moduleError) throw new Error("module boot failed: " + sandbox.__moduleError);

  // one chat turn: type into the box, hit send, read the newest bubble
  async function send(text) {
    const before = countBubbles();
    els.box = els.box || makeEl(); els.thread = els.thread || makeEl();
    els.box.value = text;
    await sandbox.send();
    await new Promise(r => setTimeout(r, 250));
    return bubbles().slice(before).filter(s => s && s !== text).join(" | ");
  }
  function bubbles() {
    const out = [];
    (function walk(el) { if (!el) return; if (el._text) out.push(el._text); if (el._bubble) walk(el._bubble); (el.children || []).forEach(walk); })(els.thread || makeEl());
    return out;
  }
  function countBubbles() { return bubbles().length; }
  return { sandbox, els, send };
}

(async () => {
  const store = {};   // one localStorage shared across "sessions" — same origin, same device

  // ── SESSION A: facts stated in chat ──────────────────────────────────────────────────
  const a = await bootSession(store);
  await a.send("my name is Chris");
  await a.send("i live in Denver");
  const stored = JSON.parse(store.aubs_memories || "[]");
  t("facts stated in chat are STORED (extraction path)", stored.length === 2 && /name is Chris/i.test(stored.join("|")) && /lives in Denver/i.test(stored.join("|")));
  const settings = JSON.parse(store.aubs_settings || "{}");
  t("name stated in chat SYNCED to the governed fact source (S.userName, persisted)", settings.userName === "Chris");
  a.sandbox.openDrawer();
  t("memory counter reads the STORED list (\"2 memories stored\")", a.els.memCount && /^2 memories stored$/.test(a.els.memCount._text));

  // ── SESSION B: a NEW session over the same storage (the live failing scenario) ───────
  const b = await bootSession(store);
  const recall = await b.send("what do you know about me?");
  t("new session → \"what do you know about me?\" reflects stored memories", /Chris/.test(recall) && /Denver/.test(recall));
  t("recall is NOT mangled by identityGuard (\"I don't know your name yet\" bug)", !/don't know your name/i.test(recall));
  const name = await b.send("what's my name?");
  t("new session → \"what's my name?\" answers from the governed fact", /Your name is Chris/i.test(name));

  // ── COUNTER / CLEAR / STORAGE: one source ─────────────────────────────────────────────
  b.sandbox.openDrawer();
  t("counter still matches storage in the new session", /^2 memories stored$/.test(b.els.memCount._text));
  b.sandbox.clearMemories();
  t("clear acts on the SAME stored list the counter showed (storage emptied)", JSON.parse(store.aubs_memories || "[]").length === 0);
  t("counter follows the clear (\"No memories yet\")", /No memories yet/.test(b.els.memCount._text));
  b.sandbox.clearMemories();   // second clear: nothing stored — must say so, not desync
  t("clear on empty storage reports honestly (toast: \"No memories to clear\")", /No memories to clear/.test(b.els.toast ? b.els.toast._text : ""));

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("MEMORY RECALL E2E OK: chat-stated facts persist, survive a new session, reach recall un-mangled, sync the governed user name, and the counter/clear/storage never disagree.");
  process.exit(0);
})().catch(e => { console.error("memory-recall e2e crashed:", e); process.exit(1); });
