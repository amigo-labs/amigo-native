# Candidate review: `gpt-tokenizer`

> **Status:** SHIPPED as sub-surface of `@amigo-labs/tiktoken`, but **NO-GO as a competitor** · **Predicted:** 🟢 Green · **Measured:** 🔴 Red (gpt-tokenizer is 2–3× faster than us) · **Reviewed:** 2026-04-19

## Verdict

`gpt-tokenizer` is a pure-JS port of the same BPE algorithm (cl100k_base / o200k_base / o200k_harmony) with an extended API: chat-specific token counting, `isWithinTokenLimit`, generator streaming, cost estimation. The algorithmic core is 100% the same as `tiktoken`/`js-tiktoken`, the FFI shape is identical — but against a pure-JS baseline the speedup is structurally *larger* than against `tiktoken` (WASM), because we're not competing against an equally native core. **Recommendation: no separate crate, instead fold the gpt-tokenizer extras (`encodeChat`, `isWithinTokenLimit`, `countChatCompletionTokens`) into `@amigo-labs/tiktoken`.** A second crate would be double maintenance with no added value.

## JS package

- **npm:** `gpt-tokenizer` (author: Bazyli Brzóska, niieani) — "the fastest, smallest and lowest footprint GPT tokenizer" (self-described)
- **Downloads:** ~1M weekly (Q1 2026 estimate, BACKLOG)
- **Exports / API surface:**
  - `encode(text)` / `decode(tokens)` — core, identical to tiktoken
  - `encodeChat(messages, model)` — ChatML/Harmony overhead calculation
  - `countTokens(text)` / `countChatCompletionTokens(messages, model)` — count without array alloc
  - `isWithinTokenLimit(text, limit)` — **early-exit version** of encode, stops when the limit is exceeded
  - `encodeGenerator` / `decodeGenerator` / `decodeAsyncGenerator` — streaming via generators
  - `estimateCost(text, model)` — pricing data for 100+ models built in
  - LRU merge cache internally (performance optimization)
- **Typical input:** identical to tiktoken — UTF-8 text or `ChatMessage[]`
- **Typical output:** `number[]` token arrays, or boolean for `isWithinTokenLimit`, or generator iteration
- **Realistic median use-case:** **chat-app cost control.** Before every OpenAI API call, `countChatCompletionTokens(messages, "gpt-4o")` is called to estimate input cost and check the context window. Input: 5–50 messages at ~200 tokens = ~5–50 KB text. Call frequency: 1 per user turn

## Rust replacement

- **Candidate crate(s):** `tiktoken-rs 0.11.0` — **same backend as for tiktoken**. Chat-overhead rules, pricing data and early-exit would be wrapper code inside `@amigo-labs/tiktoken`
- **Maintenance / license:** active (2026-04-08), MIT, see `tiktoken.md` for details
- **Known gotchas / divergences:**
  - Chat-overhead rules differ **per model**: gpt-3.5-turbo = 4 tokens/msg + 2/reply, gpt-4 = 3+3, gpt-4o = Harmony format. Has to be expressed as a lookup table in Rust (like gpt-tokenizer's `mappings.ts`). Parity tests required
  - Implement `isWithinTokenLimit` as a genuine early-exit variant in the Rust encoder (tiktoken-rs doesn't offer that directly — own wrapper with `encode_with_limit(text, limit)` needed)
  - Generator APIs (`encodeGenerator`) are more expensive in NAPI. Proposal: **do not port.** The user falls back to a pure-JS generator over chunks, or we offer `encodeMany(chunks)` instead
  - `estimateCost` = pricing lookup + token count. Pricing data drifts (OpenAI changes prices). **Not in Rust.** User-side JS multiplier on `countTokens()` output

## BACKLOG check

> **gpt-tokenizer** (~1M). Same `tiktoken-rs` backend, different JS API surface. Near-free second port once `tiktoken` ships.

**Correction to the backlog assumption:** "second port" is misleading. There is *no* second crate that makes sense — the same `tiktoken-rs` wrapper with an extended surface serves both npm packages. Users see the same `@amigo-labs/tiktoken` package as a drop-in for both.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Identical to `tiktoken.md` bucket-wise. **Bonus:** `isWithinTokenLimit` exits early on short strings → even cheaper compute, FFI share rises |
| Input size distribution | Chat use-case: 5–50 messages, 5–50 KB total text. Favorable medium regime, FFI share < 1% |
| Output size distribution | `countTokens()` returns `number` — cheapest shape, ~180 ns marshal. `encodeChat` returns `Uint32Array` + an overhead number — struct marshalling, ~500 ns |
| Reusable setup (stateful potential) | Same as tiktoken — NAPI class mandatory. In addition: chat-overhead rules and model mapping are constant, live in the class constructor |
| Batch-usage realism | `encodeChat` *is* already an implicit batch (N messages per call). Plus the standard `encodeMany` from tiktoken. Two batch shapes covered |
| FFI-share estimate vs. Rust work | <1% for the chat use-case. For `isWithinTokenLimit` with short strings + low limit perhaps 5–10% (early-exit makes compute tiny) |

## Classification reasoning

`gpt-tokenizer` is **pure JavaScript** — that's the decisive difference from `tiktoken` (WASM). The external bench reference for pure JS (`js-tiktoken`, algorithmically almost identical) gives:

- 1 MB: 1006 ms pure JS vs. 359 ms tiktoken-rs → **2.80×** Rust speedup — **clear Green**
- Medium: 0.96 ms vs. 0.54 ms → **1.78×** — just below the Green gate, probably 2× with clean napi-rs integration

gpt-tokenizer's LRU merge cache is a micro-opt; it doesn't close the gap to tiktoken-rs (both use HashMaps, Rust's code is simply more CPU-cache-friendly without V8 object indirections).

**Algorithmic profile:**
- **Like** `sanitize-html`/`csv`: substantial per-call compute, string-in, typed output, state-as-class
- **Not** like `levenshtein`: no string-distance hot loop on 10-char strings (pure-JS tokenizer runs ~1 µs on 10 chars, NAPI ~1–2 µs — we don't lose catastrophically)
- **Like** `xxhash-batch`: if the output API is implemented naively as `number[]` it tips. **Strict `Uint32Array`.**

**Small-input case:** for `isWithinTokenLimit("hi", 100)` — 2-byte string, limit 100, immediate early-exit → pure JS does it in ~500 ns. Rust via NAPI ~400–600 ns. Parity, no win and no loss. **Acceptable as a Yellow floor**, not Red.

**Generator-streaming gap:** the `encodeGenerator`/`decodeAsyncGenerator` surface of gpt-tokenizer has no direct Rust equivalent. Users who *really* need it (rare — usually people just switch to a chunked array) stay on pure JS, or we document migration to `encodeMany(chunks)`. **Do not treat as a blocker.**

## If GO — proposed port

**No separate crate.** Fold the extras into `@amigo-labs/tiktoken` as an API extension.

- **Recommended crate name:** `@amigo-labs/tiktoken` (same crate as `tiktoken.md`)
- **Primary API sketch — extension of the tiktoken class:**
  ```ts
  export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    name?: string
  }

  export interface ChatEncodeResult {
    tokens: Uint32Array
    overhead: number  // ChatML/Harmony message-framing tokens
  }

  export declare class Tiktoken {
    // ... from tiktoken.md ...

    // gpt-tokenizer surface:
    encodeChat(messages: ChatMessage[], model: string): ChatEncodeResult
    countChatCompletionTokens(messages: ChatMessage[], model: string): number
    isWithinTokenLimit(text: string, limit: number): boolean
    // Intentionally not ported: encodeGenerator, decodeAsyncGenerator, estimateCost
  }
  ```
  → `estimateCost` moved into JS land: the user multiplies `countTokens()` × their own pricing table. The Rust crate should not bundle rate-changing pricing data (drift, breaking changes)
  → Generator APIs explicitly documented as *not ported* with migration to `encodeMany(chunks)`

- **Must-have benchmark scenarios:**
  - All from `tiktoken.md` apply
  - **New:** `countChatCompletionTokens(10 messages, "gpt-4o")` — median use-case of gpt-tokenizer
  - **New:** `isWithinTokenLimit(short_text, 100)` — early-exit fast path, floor check
  - **New:** `isWithinTokenLimit(long_text, 100)` — early-exit after N tokens, verify we actually exit early (no full encode)
  - **Baseline:** **Both** gpt-tokenizer (pure JS) **and** tiktoken (WASM) as comparators. js-tiktoken optional since algorithmically nearly identical to gpt-tokenizer

- **Acceptance thresholds (Green gate):**
  - ≥2.0× vs. `gpt-tokenizer` at medium (chat use-case) and large — main target baseline
  - ≥1.0× vs. `gpt-tokenizer` at small (`isWithinTokenLimit` short-circuit) — floor check
  - ≥0.95× vs. `gpt-tokenizer` at the early-exit case — may lose marginally because pure JS's early heuristic (char count) is trivial
  - 100% parity: `encodeChat` against gpt-tokenizer fixture tests (gpt-3.5-turbo, gpt-4, gpt-4o, gpt-5) for overhead numbers
  - Cross-verify: token sequences bit-identical to `gpt-tokenizer` on 1000 random chat conversations

- **Risks:**
  1. **Scope creep into the `@amigo-labs/tiktoken` crate.** +~300 LoC for chat-overhead rules + model mapping. Acceptable because the benefit (1M weekly DL served) is high — but the API surface gets broad. Mitigation: put `encodeChat` etc. in its own file `src/chat.rs`, separate tests
  2. **Model-overhead rules drift:** OpenAI adds new models. `gpt-tokenizer` updates its mappings in minor releases. We need to follow → possibly a quarterly review as a standing task
  3. **`isWithinTokenLimit` early-exit implementation:** `tiktoken-rs` has no native early-exit API. We have to manually wrap the encoder loop with a counter. Parity test mandatory, that we don't tokenize further than necessary (otherwise the fast-path claim is false)
  4. **Generator API gap:** users relying on `encodeGenerator` (streaming LLM decoder UIs) have no 1:1 path. Migration doc mandatory. Probably <5% of users — acceptable
  5. **Pricing data outsourced:** `gpt-tokenizer` users who use `estimateCost()` have to keep their own pricing logic. Migration example in the README: ~10 LoC. No blocker
  6. **Two-way positioning:** the README has to make clear that the crate serves both `tiktoken` and `gpt-tokenizer` users. Report speedup numbers per baseline, don't average them

## If NO-GO — BACKLOG entry

N/A — GO recommended as an API extension of `@amigo-labs/tiktoken`, not as a separate crate.

## Phase B measurement (2026-04-19, linux-x64, Node v22)

Prediction was wrong. `gpt-tokenizer` does **not** use the same performance profile as `js-tiktoken`. Measured against `@amigo-labs/tiktoken` (same binary as the tiktoken perf review), `cl100k_base`:

| Scenario | @amigo-labs/tiktoken | gpt-tokenizer | Ratio |
|---|---:|---:|---:|
| encode 10 B (small) | 164,256 hz | **586,445 hz** | 0.28× (3.57× slower) |
| encode ~2 KB (medium) | 5,999 hz | **14,855 hz** | 0.40× (2.48× slower) |
| encode ~90 KB (large) | 126 hz | **269 hz** | 0.47× (2.13× slower) |
| 100 × 10 B (RAG batch) | 1,471 hz | **4,364 hz** | 0.34× (2.97× slower) |

**We lose on every measurement point.** The predicted Green (2.8× faster) was estimated based on the `js-tiktoken` benchmark. But `gpt-tokenizer` is **8–9× faster than `js-tiktoken`** — the same measurement against `js-tiktoken` would have given us Green.

**Why gpt-tokenizer is so much faster than js-tiktoken:**
- **LRU merge cache** (explicitly documented feature). Repeated bigram pairs within a single `encode()` call are served from cache instead of recomputed. For natural-language text with redundant word pairs the hit rate is very high.
- **V8-optimized hot path.** gpt-tokenizer's author (niieani) deliberately wrote the BPE merge loop for V8's JIT: monomorphic objects, no polymorphism, stable `Map` shapes.
- **No FFI.** Even our 109 ns NAPI floor is paid per call; gpt-tokenizer has a 0 ns floor.

**Why our native Rust doesn't help:**
- `tiktoken-rs` has no LRU merge cache. The BPE merge loop runs O(n²) over the chunks instead of cache-amortized.
- V8's JIT is competitive with Rust's `rustc_hash` for BPE lookups — the cache-locality advantages of Rust are eaten by the cache-miss penalty
- We're not up against C++ bindings (argon2 pattern) or text-processing specialists (sanitize-html pattern), we're up against a **hand-optimized pure-JS competitor** with a domain-specific caching strategy. That's a completely different race.

**Final classification: 🔴 Red against gpt-tokenizer** — not catchable without optimization.

**What we still ship:**
- `encodeChat` / `countChatCompletionTokens` / `isWithinTokenLimit` as a sub-surface of the `@amigo-labs/tiktoken` crate — consistent API, but primarily relevant for the `tiktoken` npm users (who also miss this API), not as a migration for gpt-tokenizer users
- **README text:** explicit note "not faster than gpt-tokenizer" — no false promises

**Phase-C option for a future review:**
- **C.6 algorithm swap:** submit the LRU merge cache to `tiktoken-rs` upstream (PR to zurawiki/tiktoken-rs). Realistic 1.5–2× win, closes the gap to gpt-tokenizer, but probably doesn't reach it (FFI floor remains)
- **Re-review in 6 months** if `tiktoken-rs` adds caching or gpt-tokenizer gets structurally slower

**BACKLOG recommendation:** remove the entry from "Under investigation — Predicted Green" and move to "Ported then deprecated — measured Red/Black" — subcategory "competes with an over-optimized pure-JS". This ensures future candidate scans read the post-mortem before considering a separate gpt-tokenizer port.
