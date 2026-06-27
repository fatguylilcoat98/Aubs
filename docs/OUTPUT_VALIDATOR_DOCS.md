# AUBS Output Validator — Complete Documentation

## Overview

The **Output Validator** is the **quality gate** that every AI response passes through before being shown to the user or saved to AppState.

**Purpose:** Catch hallucinations, safety issues, and malformations before they reach the user.

**Key principle:** Validate, don't modify. If validation fails, return status and warnings instead of silently rewriting.

```
AI Response
    ↓
OutputValidator.validate()
    ├─ Empty check
    ├─ Hallucination detection
    ├─ Safety filter
    ├─ Malformation detection
    ├─ Consistency checks (placeholders)
    └─ Confidence scoring
    ↓
Returns: { valid, response, warnings, confidence }
    ↓
If valid: Display & Save to AppState
If invalid: Show warning, don't save
```

---

## Validation Flow Diagram

```
┌─────────────────────────────────────────────┐
│ AI Response comes back from ModelAdapter    │
│ (e.g., from MockEngine, WebLLM, API)       │
│                                              │
└────────────────────┬────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────┐
│ ConversationController.sendMessage()        │
│                                              │
│ 1. Display user message (optimistic)        │
│ 2. Call ModelAdapter.send()                 │
│ 3. Receive response                         │
│                                              │
└────────────────────┬────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────┐
│ OutputValidator.validate(response)          │
│                                              │
│ VALIDATION LAYER:                           │
│                                              │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ↓                         ↓
    ✓ VALID                   ✗ INVALID
        │                         │
        │                         │ - Empty
        │                         │ - Hallucination markers
        │                         │ - Safety issues
        │                         │ - Malformation
        │                         │ - Low confidence
        │                         │
        ↓                         ↓
┌──────────────────┐       ┌──────────────────┐
│ Display message  │       │ Show error/warn  │
│ Save to AppState │       │ Don't save       │
│ Return success   │       │ Return failure   │
└──────────────────┘       └──────────────────┘
        │                         │
        └────────────┬────────────┘
                     ↓
            Return to UI
       { valid, response,
         warnings, confidence }
```

---

## Public API Reference

### `OutputValidator.validate(response, context)`

**Parameters:**
- `response` (string) — The AI's response text
- `context` (object, optional) — Additional context for validation
  - `checkMemoryConsistency` (bool) — Enable memory consistency checks (future)
  - `checkIdentityCoreAdherence` (bool) — Enable Identity Core adherence checks (future)
  - `memories` (array) — User's stored memories (for future use)
  - `identityCore` (string) — The Identity Core prompt (for future use)

**Returns:** `{ valid, response, warnings, confidence, timestamp }`

```javascript
{
  valid: boolean,              // Should response be displayed and saved?
  response: string,            // The original response text
  warnings: string[],          // Issues detected (empty = no issues)
  confidence: number,          // 0.0 to 1.0 (0 = invalid, 1.0 = perfect)
  timestamp: string           // ISO 8601 timestamp
}
```

**Example:**

```javascript
const result = OutputValidator.validate("Hello! How can I help?", {
  checkMemoryConsistency: true,
  checkIdentityCoreAdherence: true,
  memories: getState().memories
});

if (result.valid) {
  displayMessage(result.response);
  saveToAppState(result.response);
} else {
  showWarning(`Response rejected: ${result.warnings.join(', ')}`);
}
```

---

## Validation Checks

### 1. Empty Response Check

**Detects:**
- Null/undefined responses
- Empty strings
- Whitespace-only responses

**Result on failure:** `valid: false, confidence: 0`

---

### 2. Length Validation

**Checks:**
- Minimum length (default: 1 character)
- Maximum length (default: 10,000 characters)

**Config:**
```javascript
OutputValidator.config.minResponseLength = 1
OutputValidator.config.maxResponseLength = 10000
```

**Result:**
- Too short: `confidence *= 0.8`
- Too long: `confidence *= 0.9`

---

### 3. Hallucination Detection

**Detects:**

**Fabricated citations:**
```
[source: unknown]
[citation: none]
[url: not found]
```

**Fake URLs:**
```
https://[placeholder]
https://example.fake
http://fake.com
```

**Repetitive filler:**
```
"as mentioned above"
"as noted earlier"
"as discussed previously"
```

**Over-confident claims:**
```
"I am 100% certain"
"absolutely guaranteed"
"without a doubt"
```

**Placeholder text:**
```
[placeholder]
{section_title}
xxx, yyy, zzz
todo, fixme
```

**Lorem ipsum:**
```
"lorem ipsum dolor sit amet"
"consectetur adipiscing"
```

**Result on detection:** `confidence *= 0.7`

---

### 4. Safety Filter

**Detects:**

**Explicit harm instructions:**
```
"how to make a bomb"
"guide to poisoning someone"
"instructions for violence"
```

**Self-harm guidance:**
```
"how to commit suicide"
"instructions for self-harm"
```

**Illegal activity guidance:**
```
"how to hack a system"
"instructions for fraud"
"guide to counterfeiting"
```

**Deception/manipulation:**
```
"how to scam someone"
"guide to blackmail"
"instructions for catfishing"
```

**Result on detection:** `valid: false, confidence: 0`
*Response is completely rejected, not displayed or saved.*

---

### 5. Malformation Detection

**Detects:**

**Excessive special characters** (>30% of text):
```
"!!!???@@@$$$%%%^^^&&&"
```

**Unbalanced brackets:**
```
"[[[content" (missing ]]]")
"{ some { nested } but not closed properly"
```

**Excessive line breaks:**
- More line breaks than half the word count

**Encoding errors:**
- Invalid UTF-8 replacement characters

**Result on detection:** `confidence *= 0.85`

---

### 6. Consistency Checks (Placeholders)

**Reserved for future implementation:**

Three placeholder extension points are defined but not yet implemented:

1. **Memory Consistency** — Compare response against user's stored memories
   - *Future check:* Does the response contradict known facts about the user?
   - Placeholder: `_checkMemoryConsistency(text, memories) → warnings[]`

2. **Identity Core Adherence** — Check if response violates the Identity Core
   - *Future check:* Does it violate truth, honesty, or safety principles?
   - Placeholder: `_checkIdentityCoreAdherence(text, identityCore) → warnings[]`

3. **Semantic Consistency** — Compare against previous responses
   - *Future check:* Does it contradict earlier answers in the conversation?
   - Placeholder: `_checkSemanticConsistency(text, previousResponses) → warnings[]`

**Current state:** Placeholders are ready but not implemented. Future governance modules can fill them in without changing OutputValidator's interface.

---

## Configuration

```javascript
OutputValidator.config = {
  minResponseLength: 1,           // Minimum acceptable response length
  maxResponseLength: 10000,       // Maximum acceptable response length
  hallucinationThreshold: 0.3,    // Unused (reserved for ML-based detection)
  confidenceThreshold: 0.5        // Min confidence score to pass validation
}
```

**To customize:**
```javascript
OutputValidator.config.maxResponseLength = 5000; // Shorter responses only
OutputValidator.config.confidenceThreshold = 0.7; // Stricter validation
```

---

## How ConversationController Uses It

**In `sendMessage(text)`:**

```javascript
async sendMessage(text) {
  // ... validation and optimistic display ...

  const response = await ModelAdapter.send(trimmed);

  if (!response.success) {
    // ModelAdapter failed, don't validate further
    return { success: false, error: response.error };
  }

  // VALIDATION GATE
  const validationResult = OutputValidator.validate(response.message, {
    checkMemoryConsistency: true,
    checkIdentityCoreAdherence: true,
    memories: getState().memories
  });

  if (!validationResult.valid) {
    // Validation failed: remove optimistic message, show error
    if (userMsgElement) userMsgElement.remove();
    return {
      success: false,
      error: 'Response rejected: ' + validationResult.warnings.join('; '),
      warnings: validationResult.warnings
    };
  }

  // Validation passed: display and save
  this._displayAiMessage(validationResult.response);
  return {
    success: true,
    message: validationResult.response,
    warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined,
    confidence: validationResult.confidence
  };
}
```

---

## Error Handling

**Validation failures are non-fatal.**

If `OutputValidator.validate()` returns `valid: false`:
1. Optimistic user message is **removed from UI**
2. Error message is **shown to user** with warnings
3. Response is **NOT saved to AppState**
4. User can try again

**Example error message:**
```
Response validation failed:
- Detected placeholder text
- Low confidence score
```

---

## Testing the Validator

### Test Valid Response

```javascript
const result = OutputValidator.validate("Hello! I'm ready to help.");
console.log(result);
// {
//   valid: true,
//   response: "Hello! I'm ready to help.",
//   warnings: [],
//   confidence: 1.0,
//   timestamp: "..."
// }
```

### Test Hallucination Detection

```javascript
const result = OutputValidator.validate(
  "As mentioned above [source: unknown], the answer is xyz."
);
console.log(result);
// {
//   valid: false,
//   warnings: [
//     "Detected invalid citation markers",
//     "Detected placeholder text",
//     "Low confidence score"
//   ],
//   confidence: 0.35
// }
```

### Test Safety Filter

```javascript
const result = OutputValidator.validate(
  "Here is a guide to making a bomb..."
);
console.log(result);
// {
//   valid: false,
//   warnings: ["SAFETY: Response contains harmful instructions"],
//   confidence: 0
// }
```

### Test Malformation

```javascript
const result = OutputValidator.validate(
  "Content with [[[ unbalanced brackets ]]]]]"
);
console.log(result);
// {
//   valid: false,
//   warnings: ["Detected unbalanced brackets"],
//   confidence: 0.85
// }
```

---

## Future Extension Points

### Implementing Memory Consistency

Future governance modules can implement this:

```javascript
OutputValidator._checkMemoryConsistency = function(text, memories) {
  const warnings = [];
  
  // Compare text against each memory
  memories.forEach(memory => {
    if (this._contradicts(text, memory)) {
      warnings.push(`Contradicts known fact: ${memory}`);
    }
  });
  
  return warnings;
};
```

### Implementing Identity Core Adherence

```javascript
OutputValidator._checkIdentityCoreAdherence = function(text, identityCore) {
  const warnings = [];
  
  if (this._inviolatesTruth(text)) {
    warnings.push('Violates truth principle');
  }
  
  if (this._inviolatesHonesty(text)) {
    warnings.push('Violates honesty principle');
  }
  
  if (this._inviolatesSafety(text)) {
    warnings.push('Violates safety principle');
  }
  
  return warnings;
};
```

### Implementing Semantic Consistency

```javascript
OutputValidator._checkSemanticConsistency = function(text, previousResponses) {
  const warnings = [];
  
  previousResponses.forEach(prev => {
    if (this._contradicts(text, prev)) {
      warnings.push('Contradicts previous response');
    }
  });
  
  return warnings;
};
```

---

## What OutputValidator Does NOT Do

- ❌ Rewrite responses (returns original or rejects)
- ❌ Call models or AI systems
- ❌ Read/write localStorage
- ❌ Contain UI code
- ❌ Implement all consistency checks (placeholders for future)
- ❌ Make decisions (returns status, ConversationController decides)

**It validates. That's it.**

---

## Status

**✅ Section 6 Complete.**

- [x] OutputValidator module built
- [x] Empty check
- [x] Hallucination detection
- [x] Safety filter
- [x] Malformation detection
- [x] Confidence scoring
- [x] Placeholder extension points (3 hooks reserved)
- [x] ConversationController integration
- [x] Validation flow documented
- [x] Complete API reference

**Architecture guarantee:** Future governance modules can implement consistency checks without modifying OutputValidator's interface or ConversationController's logic.

---

## Files

- **`aubs-shell.html`** — Complete with Sections 1-6: UI, State, PromptBuilder, ModelAdapter, ConversationController, OutputValidator
- **`OUTPUT_VALIDATOR_DOCS.md`** — This file
- **`CONVERSATION_CONTROLLER_DOCS.md`** — ConversationController reference
- **`MODEL_ADAPTER_DOCS.md`** — ModelAdapter reference
- **`PROMPT_BUILDER_DOCS.md`** — PromptBuilder reference

---

## Next Steps (Section 7+)

Future modules can extend OutputValidator without changing it:

1. **Memory Consistency Module** — Implement `_checkMemoryConsistency`
2. **Identity Core Verification** — Implement `_checkIdentityCoreAdherence`
3. **Semantic Coherence** — Implement `_checkSemanticConsistency`
4. **Advanced Hallucination Detection** — ML-based marker detection
5. **Tone/Style Enforcement** — Ensure responses match user preferences

**The extension points are ready.**
