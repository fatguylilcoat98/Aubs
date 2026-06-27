# AUBS FastEngine — Complete Integration Guide

## Overview

**FastEngine** is the first real model integration for AUBS. It replaces MockEngine with actual Llama 3.2 1B inference running locally in the browser via WebLLM.

**Key principle:** FastEngine is the **reference implementation** that all future models (Smart, Advanced) will follow. One engine works extremely well before scaling to others.

---

## What Changed (Section 8)

### Before Section 8 ❌
- MockEngine: Placeholder responses, no real inference
- Hard to test real performance
- No actual model loading/execution

### After Section 8 ✅
- FastEngine: Real Llama 3.2 1B local inference
- Full performance metrics (load time, latency, throughput)
- WebLLM integration with progress reporting
- Offline-first: model runs entirely in browser
- Zero modification to RuntimePipeline, PromptBuilder, OutputValidator, or AppState

---

## Architecture: What Stayed the Same

```
ConversationController
       ↓
RuntimePipeline.execute()
       ├─ Stage 2: PromptBuilder (UNCHANGED)
       ├─ Stage 3: ModelAdapter (UNCHANGED)
       │         └─ Registered Engine: MockEngine → FastEngine (CHANGED)
       ├─ Stage 4: OutputValidator (UNCHANGED)
       └─ Stage 5: AppState (UNCHANGED)
```

**Only the engine changed. Everything else is identical.**

---

## Setup: Enable FastEngine

### Step 1: Add WebLLM to HTML

FastEngine requires WebLLM. Add this to `aubs-shell.html` `<head>`:

```html
<script src="https://webllm.mlc.ai/webllm-all.js"></script>
```

**That's it.** The system auto-detects WebLLM and switches to FastEngine.

### Step 2: Verify in Browser Console

Open browser console (F12) and check:

```javascript
console.log(ModelAdapter.getModelInfo());
// {
//   name: 'FastEngine',
//   model: 'Llama-3.2-1B-Instruct',
//   status: 'uninitialized',
//   ...
// }
```

### Step 3: Initialize FastEngine

```javascript
await ConversationController.initialize();
// FastEngine loads the model (first time: 30-60 seconds)
// Progress reported to console

console.log(ConversationController.isReady()); // true when done
```

---

## Manual Testing Checklist

### ✅ Pre-Test
- [ ] WebLLM script loaded in HTML
- [ ] Browser console open (F12)
- [ ] Check `ModelAdapter.getModelInfo()` shows `FastEngine`

### ✅ Initialization Test
```javascript
await ConversationController.initialize();
// Watch console for progress: "FastEngine ✓ Loaded in XXXms"
```

- [ ] Model loads without errors
- [ ] Load time appears in metrics
- [ ] No UI freezing during load

### ✅ First Message Test
```javascript
const result = await ConversationController.sendMessage("Hello!");
console.log(result);
```

- [ ] Message appears optimistically
- [ ] Response appears after inference
- [ ] No UI freezing during response
- [ ] `result.executionId` is present
- [ ] `stageLogs` show all 5 stages passing

### ✅ Performance Metrics Test
```javascript
const result = await ConversationController.sendMessage("Who are you?");
console.log(result.stageLogs);
// Look for the inference stage:
// { stage: 'inference', status: 'passed', responseLength: X }

console.log(ModelAdapter.getModelInfo().metrics);
// {
//   modelLoadTime: 45000,
//   firstTokenLatency: 250,
//   totalGenerationTime: 3200,
//   tokensGenerated: 127,
//   tokensPerSecond: '39.69'
// }
```

- [ ] Load time reasonable (30-120 seconds first load, cached after)
- [ ] First token latency < 500ms
- [ ] Total generation time proportional to response length
- [ ] Tokens/sec between 10-100 (depending on hardware)

### ✅ Cancellation Test
```javascript
const promise = ConversationController.sendMessage("Write a long story...");
await new Promise(r => setTimeout(r, 500)); // Wait 500ms
await RuntimePipeline.execute("cancel").cancel();
// Response should stop, optimistic message removed
```

- [ ] Cancel works without errors
- [ ] UI updates correctly
- [ ] No orphaned state

### ✅ Multiple Messages Test
Send 3-5 messages in sequence:

```javascript
await ConversationController.sendMessage("Hello");
await ConversationController.sendMessage("What's your name?");
await ConversationController.sendMessage("Tell me a joke");
```

- [ ] All messages process correctly
- [ ] Chat history grows
- [ ] No state corruption
- [ ] Metrics update for each

### ✅ Error Handling Test
```javascript
// Remove WebLLM script, reload
// Try to initialize
await ConversationController.initialize();
// Should fail gracefully with helpful error
```

- [ ] Errors are clear and actionable
- [ ] System doesn't crash
- [ ] Can recover by adding WebLLM and reinitializing

---

## FastEngine API Reference

### `FastEngine.initialize()`

**Purpose:** Load the Llama 3.2 1B model into browser memory

**Returns:** `{ success: boolean, loadTime?: number, error?: string }`

**Behavior:**
- First call: Downloads model (~2-4 GB), caches locally, 30-120 seconds
- Subsequent calls: Uses cache, instant
- Non-blocking: Progress reported via `onProgress` callback
- Cannot be called twice simultaneously

**Example:**
```javascript
const engine = new FastEngine();
const result = await engine.initialize();

if (result.success) {
  console.log(`Model loaded in ${result.loadTime}ms`);
} else {
  console.error('Failed to load:', result.error);
}
```

---

### `FastEngine.send(messages)`

**Purpose:** Run inference on the model

**Parameters:**
- `messages` (array) — Complete messages array from PromptBuilder
  ```javascript
  [
    { role: 'system', content: 'You are helpful...' },
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'Who are you?' }
  ]
  ```

**Returns:**
```javascript
{
  success: boolean,
  message: string,           // Generated response
  usage: {
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  },
  metrics: {
    modelLoadTime: number,
    firstTokenLatency: number,
    totalGenerationTime: number,
    tokensGenerated: number,
    tokensPerSecond: string
  }
}
```

**Example:**
```javascript
const result = await engine.send([
  { role: 'system', content: 'Be concise.' },
  { role: 'user', content: 'What is 2+2?' }
]);

if (result.success) {
  console.log(result.message);  // "2+2 equals 4."
  console.log(result.metrics.tokensPerSecond);  // "45.2"
} else {
  console.error(result.error);
}
```

---

### `FastEngine.isReady()`

**Purpose:** Check if engine can accept a `send()` call

**Returns:** `boolean`

**Conditions for ready:**
- Model is loaded
- Not currently loading
- Not currently sending

**Example:**
```javascript
if (engine.isReady()) {
  await engine.send(messages);
} else {
  console.log('Wait for engine to be ready');
}
```

---

### `FastEngine.cancel()`

**Purpose:** Stop an in-progress inference

**Returns:** `{ success: boolean, error?: string }`

**Example:**
```javascript
const promise = engine.send(messages);
// User clicks "Stop"
await engine.cancel();
// Inference stops, returns error
```

---

### `FastEngine.getInfo()`

**Purpose:** Get engine metadata and metrics

**Returns:**
```javascript
{
  name: 'FastEngine',
  model: 'Llama-3.2-1B-Instruct',
  contextWindow: 8192,
  capabilities: ['streaming', 'cancellation', 'progress'],
  status: 'ready',  // or 'loading', 'uninitialized'
  metrics: {
    modelLoadTime: 45000,
    firstTokenLatency: 250,
    totalGenerationTime: 3200,
    tokensGenerated: 127,
    tokensPerSecond: '39.69'
  }
}
```

---

## Performance Metrics Explained

### `modelLoadTime` (milliseconds)
Time to download and initialize the model

- **First run:** 30,000 - 120,000ms (depends on internet, hardware)
- **Subsequent runs:** ~0ms (cached locally)
- **Typical:** 45,000ms (45 seconds) on 25 Mbps internet

### `firstTokenLatency` (milliseconds)
Time from sending message to receiving first response token

- **Typical range:** 200 - 500ms
- **Indicates:** Model startup and initial processing speed
- **Better on:** Newer hardware, better cooling

### `totalGenerationTime` (milliseconds)
Time to generate entire response

- **Scales with:** Response length
- **Typical:** 3,000 - 10,000ms for average response
- **Example:** 127 tokens in 3,200ms ≈ 39 tokens/sec

### `tokensPerSecond` (float)
Inference speed

- **Typical range:** 10 - 80 tokens/sec
- **Depends on:** CPU speed, RAM available, GPU acceleration
- **Mobile vs. Desktop:** Desktop 3-5x faster
- **Formula:** `tokensGenerated / (totalGenerationTime / 1000)`

### What "Good" Looks Like
```
Load Time: 45s (first time), 0s (cached)
First Token: 250ms
Generation Speed: 40 tok/sec
Total Time for 100-token response: 2.5 seconds
```

---

## Console Logging

FastEngine logs to console for debugging:

```javascript
[FastEngine] ✓ Loaded in 45000ms
[FastEngine] Sending prompt (1200 chars)...
[FastEngine] First token latency: 245ms
[FastEngine] ✓ Response generated | Tokens: 127 | Time: 3200ms | Speed: 39.69 tok/s
```

To see logs: Open DevTools (F12) → Console tab

---

## Development: Implementing Future Models

When adding Smart or Advanced models, follow this pattern:

```javascript
class SmartEngine {
  constructor() {
    this.name = 'SmartEngine';
    this.model = 'Llama-3.2-7B-Instruct';  // Larger model
    this.isLoaded = false;
    this.isLoading = false;
    this.isSending = false;
    this.engine = null;
    this.metrics = { ... };  // Same structure as FastEngine
    this.onProgress = null;
  }

  async initialize() {
    // Same pattern as FastEngine
    // Load 'Llama-3.2-7B-Instruct-q4f32_1'
  }

  isReady() {
    return this.isLoaded && !this.isLoading && !this.isSending;
  }

  async send(messages) {
    // Same pattern as FastEngine
    // Track metrics identically
  }

  async cancel() {
    // Same pattern as FastEngine
  }

  getInfo() {
    // Same structure as FastEngine
  }
}
```

**Key:** Every model must implement the same interface and track the same metrics.

---

## Switching Engines

### To use FastEngine:
```javascript
ModelAdapter.register(new FastEngine());
```

### To use MockEngine:
```javascript
ModelAdapter.register(new MockEngine());
```

### To use Smart Engine (future):
```javascript
ModelAdapter.register(new SmartEngine());
```

---

## System Integration

### How RuntimePipeline Uses FastEngine

```
ConversationController.sendMessage("Hello!")
       ↓
RuntimePipeline.execute("Hello!")
       ├─ Stage 3: Inference
       │  └─ ModelAdapter.send(userMessage)
       │     └─ FastEngine.send(messages)
       │        ├─ engine.generate(prompt)
       │        ├─ Track firstTokenLatency
       │        ├─ Stream tokens
       │        └─ Return { success, message, usage, metrics }
```

**RuntimePipeline doesn't care which engine is registered.** It just calls `ModelAdapter.send()`.

---

## Browser Compatibility

**FastEngine requires:**
- Modern browser with WebAssembly support
- ~4GB free RAM (for model + browser overhead)
- 30-60 seconds for initial model download
- Good internet connection (for first download)

**Tested on:**
- Chrome 90+
- Firefox 88+
- Safari 15+
- Edge 90+

**Not supported:**
- IE 11 and earlier
- Very old mobile devices (<2GB RAM)

---

## Troubleshooting

### "WebLLM not loaded"
**Problem:** Script tag missing
**Solution:** Add `<script src="https://webllm.mlc.ai/webllm-all.js"></script>` to `<head>`

### "Load hangs at 50%"
**Problem:** Slow internet or system overload
**Solution:** Wait longer, check internet speed, close other tabs

### "First token latency > 2 seconds"
**Problem:** Slow hardware or other apps using CPU
**Solution:** Close other programs, try on faster computer

### "Response is garbled"
**Problem:** Rare model corruption
**Solution:** Clear browser cache → Settings → Clear Cache → Reload

---

## Future Roadmap

| Phase | Model | Status |
|-------|-------|--------|
| Section 8 | Fast (1B) | ✅ Done |
| Section 9 | Smart (7B) | ⏳ Next |
| Section 10 | Advanced (13B) | ⏳ Future |
| Section 11 | API models (Claude, GPT) | ⏳ Future |

Each model follows FastEngine's exact pattern.

---

## Files

- **`aubs-shell.html`** — Complete with FastEngine integrated
- **`FASTENGINE_DOCS.md`** — This file
- **`RUNTIME_PIPELINE_DOCS.md`** — Unchanged (FastEngine plugs into Stage 3)
- **`MODEL_ADAPTER_DOCS.md`** — Unchanged (interface unchanged)

---

## Section 8A Validation Checklist

### ✅ Before Testing

- [ ] `aubs-shell.html` has `<script src="https://webllm.mlc.ai/webllm-all.js"></script>` in `<head>`
- [ ] Browser DevTools open (F12)
- [ ] Console tab visible
- [ ] No browser errors on page load

### ✅ Startup Test

1. Open `aubs-shell.html` in Chrome/Firefox/Safari
2. Verify UI loads without errors
3. Check console for: `[System] WebLLM detected, using FastEngine` OR `[System] WebLLM not detected, using MockEngine`
4. Observe engine status at bottom: should show `⚙ Engine: FastEngine` or `⚙ Engine: MockEngine`

**Expected result:** App loads, engine detected correctly

---

### ✅ Navigation Test

1. Click "Enter AUBS"
2. Select "Fast (Recommended)"
3. Observe:
   - [ ] Chat screen appears
   - [ ] Engine status shows `🔄 Status: uninitialized` (FastEngine) or `🔄 Status: ready` (MockEngine)
   - [ ] If MockEngine: "Offline model unavailable" message appears
   - [ ] If FastEngine: No error message

**Expected result:** Correct engine status, fallback message only for MockEngine

---

### ✅ Initialization Test (FastEngine Only)

1. If using FastEngine, wait for model load
2. Watch console for progress: `[FastEngine] Load progress: 10%`, etc.
3. Watch status UI for progress bar: `📊 0%` → `📊 100%`
4. Wait for: `[FastEngine] ✓ Loaded in XXXms`
5. Status should change: `🔄 Status: ready`

**Expected result:**
- Load completes without freezing UI
- Progress shown in console AND status bar
- Load time recorded: 30-120 seconds typical
- No UI freeze

**If this fails:**
- Check WebLLM script loaded: `console.log(typeof window.webllm)`
- Check console for errors
- Try refreshing page
- If persists: fallback to MockEngine (delete WebLLM script tag)

---

### ✅ Message Send Test (5 Messages)

Send these exact messages in order, record results:

**Message 1: "Hello"**
```javascript
await ConversationController.sendMessage("Hello");
// Record:
// - Did message appear optimistically? Y/N
// - Did response appear? Y/N
// - Was there an error? Y/N
// - Response time (from status): XXXms
// - Tokens/sec (from status): XX tok/s
```

**Message 2: "Who are you?"**
```javascript
await ConversationController.sendMessage("Who are you?");
// Same recording as above
```

**Message 3: "Tell me a joke"**

**Message 4: "What can you do?"**

**Message 5: "Goodbye"**

---

### ✅ Metrics Recording

After Message 5, run:
```javascript
const info = ModelAdapter.getModelInfo();
console.log('Engine:', info.name);
console.log('Model:', info.model);
console.log('Status:', info.status);
console.log('Metrics:', info.metrics);
```

Record:
- [ ] Model load time: ______ ms
- [ ] First token latency (Msg 1): ______ ms
- [ ] Total gen time (Msg 1): ______ ms
- [ ] Tokens/sec (Msg 1): ______ tok/s
- [ ] Avg tokens/sec (all 5 messages): ______ tok/s
- [ ] No crashes: Y/N
- [ ] No UI freezes: Y/N

---

### ✅ Error Handling Test

1. Remove WebLLM script tag from HTML
2. Refresh page
3. Verify:
   - [ ] No JS errors
   - [ ] Engine shows `MockEngine`
   - [ ] Fallback message shows: "Offline model unavailable in this browser"
   - [ ] Messages still work (with placeholder responses)

**Expected result:** Graceful fallback, no crashes

---

### ✅ Status UI Test

Verify all status indicators work:

```javascript
// Check initial state
document.getElementById('engineType').textContent   // ⚙ Engine: FastEngine
document.getElementById('modelStatus').textContent  // 🔄 Status: loading/ready
document.getElementById('loadProgress').style.display // visible if loading
document.getElementById('lastResponseTime').style.display // visible after message
document.getElementById('tokensPerSec').style.display // visible after message
```

- [ ] Engine name displays correctly
- [ ] Status changes from uninitialized → loading → ready
- [ ] Progress bar shows during load
- [ ] Response time displays after message
- [ ] Tokens/sec displays after message
- [ ] UI is clean, not ugly debug text

---

### ✅ Performance Baseline

Run 5 messages and record baseline metrics:

| Metric | Value | Status |
|--------|-------|--------|
| Model Load Time | _____ | OK / SLOW / N/A |
| First Token Latency | _____ ms | OK / SLOW |
| Avg Response Time | _____ ms | OK / SLOW |
| Avg Tokens/Sec | _____ | OK / SLOW |
| UI Freezes | _____ | None / Yes |
| Crashes | _____ | None / Yes |

**Baseline targets:**
- Load time: 30-120 seconds (first time) ✓
- First token: < 500ms ✓
- Response time: < 10 seconds ✓
- Tokens/sec: > 10 ✓
- No freezes or crashes ✓

---

## Final Report Template

```
BROWSER: Chrome / Firefox / Safari / Edge
OS: Windows / Mac / Linux
HARDWARE: CPU, RAM

ENGINE DETECTED: FastEngine / MockEngine
WEBLLM AVAILABLE: Yes / No

TEST RESULTS:
✅ Startup: PASS / FAIL / NOT TESTED
✅ Navigation: PASS / FAIL / NOT TESTED
✅ Initialization: PASS / FAIL / NOT TESTED
✅ Message Sends (5x): PASS / FAIL / NOT TESTED
✅ Metrics Display: PASS / FAIL / NOT TESTED
✅ Fallback Message: PASS / FAIL / NOT TESTED
✅ Error Handling: PASS / FAIL / NOT TESTED
✅ Status UI: PASS / FAIL / NOT TESTED

PERFORMANCE BASELINE:
- Load Time: _____ ms (target: 30-120s for first load)
- First Token: _____ ms (target: < 500ms)
- Avg Response: _____ ms (target: < 10s)
- Avg Speed: _____ tok/s (target: > 10)

ISSUES ENCOUNTERED:
1. [Issue description]
2. [Issue description]

OVERALL STATUS: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL / NOT TESTED
```

---

- [x] FastEngine class (real WebLLM inference)
- [x] ModelAdapter auto-detection (WebLLM present → FastEngine, else MockEngine)
- [x] Full performance metrics (load, latency, throughput)
- [x] Progress reporting with callbacks
- [x] Cancellation support
- [x] Async throughout (no UI freezing)
- [x] Structured errors
- [x] Complete documentation
- [x] Testing checklist

**Ready to add Smart and Advanced models following the same pattern.**
