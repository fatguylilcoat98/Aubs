# AUBS Model Adapter Layer — Complete Documentation

## Overview

The Model Adapter is the **clean abstraction layer** between the prompt system and inference engines. It enables swapping engines (MockEngine, WebLLM, llama.cpp, remote APIs) without changing UI or orchestration code.

**Architecture:**

```
UI
  ↓
ModelAdapter (this layer)
  ├─ register(engine)
  ├─ initialize()
  ├─ isReady()
  ├─ send(userMessage)
  └─ getModelInfo()
    ↓
  PromptBuilder (gets messages)
    ↓
  Active Engine (inference)
    └─ MockEngine (default, for testing)
    └─ WebLLM (on-device, future)
    └─ llama.cpp bridge (future)
    └─ Remote API (future)
```

---

## API Reference

### `ModelAdapter.register(engineInstance)`

**Parameters:**
- `engineInstance` — Object implementing the Engine Interface

**Returns:** `boolean` — true if registered, false if invalid

**Example:**
```javascript
const mockEngine = new MockEngine();
ModelAdapter.register(mockEngine);

// Later, swap to WebLLM:
const webllmEngine = new WebLLMEngine();
ModelAdapter.register(webllmEngine);
```

**Important:** Switching engines requires only this one line. The entire inference pipeline automatically uses the new engine.

---

### `ModelAdapter.initialize()`

**Returns:** `Promise<{ success: boolean, error?: string }>`

**What it does:**
1. Calls `engine.initialize()` 
2. Performs any setup needed before inference

**Must call this before using `send()`**

**Example:**
```javascript
async function startChat() {
  const result = await ModelAdapter.initialize();
  if (!result.success) {
    console.error('Failed to initialize:', result.error);
    return;
  }
  // Now ready to send messages
}
```

---

### `ModelAdapter.isReady()`

**Returns:** `boolean` — true if engine is initialized and ready for inference

**Example:**
```javascript
if (ModelAdapter.isReady()) {
  // Safe to call send()
} else {
  // Need to call initialize() first
}
```

---

### `ModelAdapter.send(userMessage)`

**Parameters:**
- `userMessage` (string) — The user's message

**Returns:** `Promise<{ success: boolean, message?: string, error?: string, timestamp?: string, usage?: {...} }>`

**What it does:**
1. Validates input
2. Calls `PromptBuilder.buildMessages(userMessage)`
3. Calls `engine.send(messages)`
4. Appends both user message and AI response to AppState via `addChatMessage()`
5. Returns structured response

**Example:**
```javascript
async function sendMessage(userMessage) {
  const response = await ModelAdapter.send(userMessage);
  
  if (response.success) {
    console.log('AI:', response.message);
    // Response is already in AppState history
  } else {
    console.error('Send failed:', response.error);
  }
}
```

**Response structure:**
```javascript
{
  success: true,
  message: "AI's response text",
  usage: { prompt_tokens: 123, completion_tokens: 45 },
  timestamp: "2026-06-27T15:30:00.000Z"
}
```

---

### `ModelAdapter.cancel()`

**Returns:** `Promise<{ success: boolean, error?: string }>`

**Cancels an in-progress send operation**

**Example:**
```javascript
// User clicks cancel button while AI is responding
await ModelAdapter.cancel();
```

---

### `ModelAdapter.getModelInfo()`

**Returns:** `object` — Information about the active engine and state

**Example output:**
```javascript
{
  name: "MockEngine",
  model: "mock-v1",
  contextWindow: 2048,
  capabilities: ["text_generation"],
  status: "ready",
  selectedModel: "fast",
  isReady: true,
  isSending: false
}
```

---

### `ModelAdapter.inspect()`

**Debug method. Returns internal state:**
```javascript
{
  engine: "MockEngine",
  isReady: true,
  isSending: false,
  modelInfo: { ... }
}
```

---

## Engine Interface

Every inference engine must implement this contract:

```javascript
class MyEngine {
  // Required properties
  name          // string: "MyEngine"
  model         // string: "model-name"

  // Required methods
  async initialize()   // → { success: bool, error?: string }
  isReady()            // → bool
  async send(messages) // → { text: string, usage?: {...} }
  async cancel()       // → void
  getInfo()            // → { name, model, contextWindow, capabilities, status }
}
```

### Required Properties

**`name` (string)**
- Display name of the engine
- Example: "MockEngine", "WebLLM", "LlamaCpp"

**`model` (string)**
- Model identifier
- Example: "mock-v1", "Llama-3.2-1B", "gpt-4"

### Required Methods

**`async initialize() → { success: boolean, error?: string }`**
- Called once at startup
- Should prepare the engine for inference (download models, allocate memory, etc.)
- Return `{ success: true }` when ready
- Return `{ success: false, error: "reason" }` on failure

**`isReady() → boolean`**
- Check if engine is initialized and ready to call `send()`
- Used by ModelAdapter to guard inference calls

**`async send(messages) → { text: string, usage?: {...} }`**
- Core inference method
- `messages` parameter is a complete messages array from PromptBuilder
- Must return the AI's response text
- Optional: include token usage info
- Throw an error if something goes wrong (ModelAdapter catches it)

```javascript
// Example return value
{
  text: "AI response here",
  usage: {
    prompt_tokens: 150,
    completion_tokens: 80,
    total_tokens: 230
  }
}
```

**`async cancel() → void`**
- Stop an in-progress inference
- Called by ModelAdapter.cancel()
- Can be no-op if your engine doesn't support cancellation

**`getInfo() → object`**
- Return metadata about the engine
- At minimum: `{ name, model, contextWindow, capabilities, status }`

```javascript
{
  name: "WebLLM",
  model: "Llama-3.2-1B",
  contextWindow: 2048,
  capabilities: ["text_generation", "reasoning"],
  status: "ready"
}
```

---

## MockEngine Reference

MockEngine is a simple placeholder for testing. It echoes believable responses without calling a real model.

**Registered by default.** Perfect for:
- Testing UI flow
- Developing state management
- Verifying prompt building
- Testing without loading actual models

**Response patterns:**
- "hello" → Greeting
- "how are you" → Friendly response
- "thank you" → Polite response
- "tell me a joke" → Joke
- "what's your name" → Identity
- Anything else → Generic placeholder

**Implementation:**
```javascript
const mockEngine = new MockEngine();
await mockEngine.initialize(); // Takes 300ms
console.log(mockEngine.isReady()); // true

const result = await mockEngine.send(messages); // Takes 800ms
// result.text is a believable placeholder response
```

---

## How to Implement a New Engine

### Example 1: WebLLM Engine (On-Device)

```javascript
class WebLLMEngine {
  constructor() {
    this.name = 'WebLLM';
    this.model = 'Llama-3.2-1B-q4f16_1';
    this.engine = null;
    this.ready = false;
  }

  async initialize() {
    try {
      // Import webllm
      const { CreateMLCEngine } = window.webllm;
      
      // Create engine
      this.engine = await CreateMLCEngine(this.model, {
        initProgressCallback: (progress) => {
          console.log(`Loading: ${Math.round(progress * 100)}%`);
        }
      });
      
      this.ready = true;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  isReady() {
    return this.ready && this.engine !== null;
  }

  async send(messages) {
    if (!this.isReady()) {
      throw new Error('WebLLM not initialized');
    }

    const response = await this.engine.chat.completions.create({
      messages: messages,
      temperature: 0.7,
      max_tokens: 512
    });

    return {
      text: response.choices[0].message.content,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens
      }
    };
  }

  async cancel() {
    if (this.engine && this.engine.resetChat) {
      await this.engine.resetChat();
    }
  }

  getInfo() {
    return {
      name: this.name,
      model: this.model,
      contextWindow: 2048,
      capabilities: ['text_generation', 'streaming'],
      status: this.ready ? 'ready' : 'not_initialized'
    };
  }
}

// Register it
const webllmEngine = new WebLLMEngine();
ModelAdapter.register(webllmEngine);
```

### Example 2: Remote API Engine (Cloud-Based)

```javascript
class RemoteAPIEngine {
  constructor(apiKey, apiUrl) {
    this.name = 'RemoteAPI';
    this.model = 'claude-3-sonnet';
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.ready = false;
  }

  async initialize() {
    try {
      // Test connection
      const response = await fetch(`${this.apiUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (response.ok) {
        this.ready = true;
        return { success: true };
      }
      return { success: false, error: 'Failed to connect to API' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  isReady() {
    return this.ready;
  }

  async send(messages) {
    if (!this.isReady()) {
      throw new Error('API not ready');
    }

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API error');
    }

    return {
      text: data.choices[0].message.content,
      usage: data.usage
    };
  }

  async cancel() {
    // Implement if your API supports it
  }

  getInfo() {
    return {
      name: this.name,
      model: this.model,
      contextWindow: 8192,
      capabilities: ['text_generation', 'reasoning'],
      status: this.ready ? 'ready' : 'not_initialized'
    };
  }
}

// Register it
const apiEngine = new RemoteAPIEngine(
  'your-api-key',
  'https://api.example.com/v1'
);
ModelAdapter.register(apiEngine);
```

---

## Switching Engines

**One-line swap:**

```javascript
// Currently using MockEngine
ModelAdapter.register(new WebLLMEngine());

// Now using WebLLM — no code changes needed in UI or PromptBuilder
```

**The entire inference pipeline automatically uses the new engine.**

---

## UI Integration Pattern

**Never call engines directly.** Always use ModelAdapter:

```javascript
// ✅ CORRECT
async function sendMessage(text) {
  const response = await ModelAdapter.send(text);
  if (response.success) {
    displayMessage(response.message);
  }
}

// ❌ WRONG — Don't do this
async function sendMessage(text) {
  const response = await myEngine.send(messages);
  // Bypasses ModelAdapter, breaks abstraction
}
```

---

## Error Handling

ModelAdapter returns structured errors:

```javascript
const response = await ModelAdapter.send("Hello");

if (!response.success) {
  switch(response.error) {
    case 'No engine registered':
      console.error('Need to register an engine first');
      break;
    case 'Engine not ready':
      console.error('Call ModelAdapter.initialize() first');
      break;
    case 'Send in progress':
      console.error('Wait for previous send to finish');
      break;
    default:
      console.error('Send failed:', response.error);
  }
}
```

---

## State Management Integration

ModelAdapter automatically:
1. Calls `PromptBuilder.buildMessages()` (reads from AppState)
2. Passes messages to engine
3. Calls `addChatMessage('user', msg)` and `addChatMessage('assistant', response)` (writes to AppState)

**Result:** Chat history is automatically persisted. The UI doesn't need to manage this.

---

## Testing Guide

### Test MockEngine

```javascript
// Check that MockEngine is registered
console.log(ModelAdapter.getModelInfo());

// Initialize
await ModelAdapter.initialize();

// Verify ready state
console.log(ModelAdapter.isReady()); // true

// Send a message
const response = await ModelAdapter.send("Hello!");
console.log(response.message); // Believable placeholder response

// Check history was updated
console.log(getState().chatHistory);
```

### Test Engine Switching

```javascript
// Start with Mock
console.log(ModelAdapter.getModelInfo().name); // "MockEngine"

// Register new engine (imaginary)
ModelAdapter.register(new MyCustomEngine());
console.log(ModelAdapter.getModelInfo().name); // "MyCustomEngine"

// Same interface, different engine
```

### Test Error Handling

```javascript
// Try to send without initializing
let response = await ModelAdapter.send("test");
console.log(response.error); // "Engine not ready"

// Send concurrent messages
const p1 = ModelAdapter.send("msg1");
const p2 = ModelAdapter.send("msg2");
// p2 gets { success: false, error: "Send in progress" }
```

---

## Architecture Benefits

**Separation of Concerns:**
- UI only knows about ModelAdapter
- ModelAdapter only knows about PromptBuilder and engines
- Engines only know about inference

**Easy Swapping:**
- Change engines with one `register()` call
- No UI changes needed
- No prompt changes needed

**Testability:**
- MockEngine for testing without real inference
- Each engine can be tested in isolation
- ModelAdapter can be tested without real engines

**Future-Proof:**
- New engines plug in without changes elsewhere
- New UI features don't need engine changes
- Prompt improvements work for all engines automatically

---

## Files

- **`aubs-shell.html`** — Contains ModelAdapter + MockEngine
- **`MODEL_ADAPTER_DOCS.md`** — This file
- **`PROMPT_BUILDER_DOCS.md`** — PromptBuilder reference
- **`AUBS_STATE_DOCS.md`** — AppState and persistence

## Status

**✅ Section 4 Complete.**

- [x] ModelAdapter module built
- [x] MockEngine implemented (for testing)
- [x] Engine interface documented
- [x] 2 example engine implementations (WebLLM, Remote API)
- [x] State integration (PromptBuilder + AppState)
- [x] Error handling
- [x] Engine switching pattern

**Ready for Section 5:** Output validation layer (truthfulness, consistency, safety checks).
