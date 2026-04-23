# Candidate review: `tiktoken`

> **Status:** SHIPPED v0.1 · **Predicted:** 🟢 Green vs. pure JS / 🟡 Yellow vs. WASM · **Measured:** 🟢 Green vs. WASM + js-tiktoken / 🔴 Red vs. gpt-tokenizer · **Reviewed:** 2026-04-19

## Verdict

`tiktoken-rs` is a clean Rust port of the OpenAI BPE tokenizer with identical algorithm parity; the API shape is the "canonical Green form" (one call per prompt, substantial compute, string-in / Uint32-out). Against `js-tiktoken` (pure JS), 2.8× on 1 MB inputs is measured externally — clearly Green. Against `tiktoken` npm (WASM), 1.2–1.3× is realistic — structurally not Green, because WASM runs the same Rust core and we only win FFI quality. **GO with positioning as a pure-JS killer, not a WASM killer**; the key risk is the small-input bucket, which absolutely has to be benched before commit.

## JS package

- **npm:** `tiktoken` (author: Dariusz Bolik, @dqbd) — WASM binding of the original Python/Rust implementation
- **Downloads:** ~15M weekly (Q1 2026 estimate, BACKLOG)
- **Exports / API surface:**
  - `get_encoding(name)` → `Tiktoken` — encoder by name (`cl100k_base`, `o200k_base`, `p50k_base`, …)
  - `encoding_for_model(model)` → `Tiktoken` — lookup by model ID
  - `tik.encode(text, allowed_special?)` → `Uint32Array`
  - `tik.decode(tokens)` → `Uint8Array` (then `TextDecoder` in JS)
  - `tik.free()` — explicit WASM memory cleanup
- **Typical input:** UTF-8 text. Range: 10-byte chat snippet to 100 KB+ RAG document
- **Typical output:** `Uint32Array` with token IDs. About 4 text characters per token → output size ~25% of input length
- **Realistic median use-case:** **RAG pipeline preprocessing.** Chunk a document (5–50 KB), encode to count/cut, decode rarely. Secondary use-case: **cost gate before API call**: `countTokens(prompt)` on ~200–2000 token chat messages. Never in a hot loop with 10-byte strings

## Rust replacement

- **Candidate crate(s):** `tiktoken-rs 0.11.0` (Arnaud Gourlay + Roger Zurawicki)
- **Maintenance / license:** actively maintained (release 2026-04-08), MIT, 381 stars, 31 releases
- **Known gotchas / divergences:**
  - Encoder functions return `Vec<u32>` — cleanly mappable to `Uint32Array` (no `BigInt` as with xxhash)
  - Singleton pattern planned for repeated calls (BPE table is ~10–50 MB RAM per encoding) — **must** run as a NAPI class, not as a free function
  - Special tokens are per-encoding configurable; the API must pass `allowed_special` / `disallowed_special` through (parity with tiktoken npm)
  - `o200k_harmony` (gpt-oss) is present in tiktoken-rs 0.11 — newer encoding, possibly missing in older js-tiktoken versions. Parity check per encoding required

## BACKLOG check

> **tiktoken** / **js-tiktoken** (~15M / ~3M). BPE tokenization over documents via `tiktoken-rs`. Batch-encode is the canonical green shape — one call per prompt, compute dominates.

The user explicitly requested `rust-check` → the backlog consensus is **refined** here: "Green" was thought of versus pure JS (`js-tiktoken`); versus WASM `tiktoken`, Yellow is realistic.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Medium:** 1 MB text ≈ 360 ms (tiktoken-rs reference, external bench). 1 KB ≈ 0.5 ms. 100 bytes ≈ ~5–20 µs. For chat messages (200–2k tokens, ~1–8 KB) real compute is 0.5–4 ms — FFI share **below 1%** |
| Input size distribution | UTF-8 string. ~35 µs FFI string conversion per 100 KB (BASELINE.md). At median input 1–10 KB that's ~0.3–3.5 µs of conversion |
| Output size distribution | `Vec<u32>` via `Uint32Array` — **must** be returned as TypedArray, not as a `Vec<u32>` JS array. A 1000-element `Vec<u32>` costs ~43 µs (BASELINE.md §4); the same content as a `Uint32Array` buffer is ~180 ns constant |
| Reusable setup (stateful potential) | **Massive.** BPE encoder state is a 10–50 MB merge table plus compiled regex. Per-call load is unacceptable → **NAPI class API mandatory** (analogous to `hnswlib-node` pattern from BACKLOG) |
| Batch-usage realism | **Optional.** The primary pattern is "one call per prompt", which is already FFI-friendly. A batch API (`encodeMany(texts: string[])`) makes sense for RAG chunk arrays — nice-to-have, not mandatory |
| FFI-share estimate vs. Rust work | <1% at median (chat message or RAG chunk); ~5–20% at a cost gate on 10-byte strings; <0.1% on large documents |

## Classification reasoning

This is a two-track case that a single tier classification can't represent cleanly.

**Against `js-tiktoken` (pure JS, ~3M weekly): 🟢 Green**
- External bench: 359 ms (Rust) vs. 1006 ms (pure JS) on 1 MB → **2.80×** — above the Green gate
- On medium (chat snippet, ~1 KB): 0.54 ms Rust vs. 0.96 ms pure JS → **1.78×** — just below Green, close to the gate
- On small (<100 bytes): indeterminate, must be benched. FFI floor 109 ns + string marshal makes the difference
- Pure JS has a non-trivial V8 hot loop for merge steps; Rust wins via `fancy-regex` + `fxhash` + no GC pressure

**Against `tiktoken` npm (WASM, ~15M weekly): 🟡 Yellow**
- External bench: 360 ms vs. 452 ms on 1 MB → **1.25×**. Structurally bounded because WASM runs the same Rust tokenizer core
- On medium: 0.54 ms vs. 0.78 ms → **1.44×**
- We only win FFI quality (napi-rs vs. WASM bridge) and compile flags. That's ~10–25%, never 2×

**Classic reference patterns:**
- **Like** `argon2`/`bcrypt`/`sanitize-html`: substantial compute per call, bytes/string-in, array/string-out, amortized setup state. Check.
- **Not** like `mime`/`deep-equal`/`levenshtein`: no ns-scale hot loop, no trivial-per-call work
- **Careful** like `xxhash-batch`: if output is returned as a `Vec<u32>` JS array (not `Uint32Array`) it tips into an FFI marshalling debacle. **Strictly return `Uint32Array`.**

**The only real small-input pitfall:** if the median use-case is "count tokens in a 10-byte prompt" (e.g. cost gate before API call with only user input), we land in a region where FFI is comparable to the compute. A pure-JS tokenizer does this in ~1–2 µs; Rust via NAPI probably ~1–3 µs. Not catastrophic, but no win. **Mandatory: bench the 10-byte and 100-byte bucket before commit, not only after the port.**

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/tiktoken`
- **Primary API sketch:**
  ```ts
  export type Encoding =
    | 'cl100k_base'      // gpt-3.5, gpt-4
    | 'o200k_base'       // gpt-4o, o1/o3/o4, gpt-5
    | 'o200k_harmony'    // gpt-oss
    | 'p50k_base' | 'p50k_edit' | 'r50k_base' | 'gpt2'

  export declare class Tiktoken {
    static getEncoding(name: Encoding): Tiktoken
    static encodingForModel(model: string): Tiktoken

    encode(text: string, allowedSpecial?: string[] | null): Uint32Array
    decode(tokens: Uint32Array): string
    countTokens(text: string): number  // fast path, skip alloc of Uint32Array
    encodeMany(texts: string[]): Uint32Array[]  // batch over RAG chunks
  }
  ```
  → **NAPI class is non-negotiable.** A free function per call would reload the BPE table per call = unusable.
  → `Uint32Array` is strict (not `number[]`) — otherwise FFI marshalling debacle (BASELINE §4).
  → `countTokens` as a fast path: returns just the length, avoids the Uint32Array allocation when the caller only wants to budget. Green-gate critical for the cost-gate use-case.

- **Must-have benchmark scenarios:**
  - **Small:** `countTokens("Hello world")` (10 B) — FFI-floor exposé
  - **Medium:** `encode(chatMessage)` with 500-token input (~2 KB) — most frequent real call
  - **Large:** `encode(ragDocument)` with 5k / 25k tokens (~20 KB / 100 KB) — chunking use-case
  - **Round-trip:** `decode(encode(x))` on medium — parity + decode perf
  - **Batch:** `encodeMany(100 × chat_message)` vs. a loop in JS — batch API justification
  - **Baseline required:** **both** JS packages — `tiktoken` (WASM) **and** `js-tiktoken` (pure JS). They have different target users and produce different speedup stories
  - **Encoding load time:** a single `getEncoding("cl100k_base")` — verify that the BPE table load stays in the class constructor, not per `encode()`

- **Acceptance thresholds (Green gate):**
  - ≥2.0× vs. `js-tiktoken` at medium and large (main target baseline)
  - ≥1.0× vs. `js-tiktoken` at small (floor check)
  - ≥1.2× vs. `tiktoken` (WASM) at medium and large (Yellow acceptable here)
  - ≥0.9× vs. `tiktoken` (WASM) at small (may lose marginally, but no 2× drop)
  - 100% parity: `encode` / `decode` round-trip over 1000 random strings per encoding
  - Cross-verify: outputs bit-identical to `tiktoken` npm on a fixture corpus

- **Risks:**
  1. **Small-input regime unclear** — the critical point. If users typically tokenize 10-byte strings (cost-gate pattern), we probably lose against pure JS (V8 JITs the BPE loop well for short inputs). Has to be measured before commit, otherwise Yellow fallback
  2. **WASM is "good enough"** — users of `tiktoken` npm see <1.3× and may not switch. Primary gain: prebuilt binaries instead of WASM bundle (~1 MB less in the node-modules tree), no WASM init latency at startup. Positioning matters
  3. **BPE-table bundle size** — `tiktoken-rs` bundles the merge tables statically into the binary. Per encoding ~2–5 MB → total binary could be ~20 MB with all 7 encodings. Mitigation: features gated per encoding, default `cl100k_base + o200k_base`, rest opt-in via `features = ["p50k", "gpt2"]`
  4. **`free()` semantics** — `tiktoken` npm forces users to call `.free()` because of WASM memory. With NAPI that's covered by GC — small API asymmetry, but parity OK (no-op `free()` for migration)
  5. **Encoding download pattern** — some users use `tiktoken`'s `load()` API to load encodings from a URL (browser/offline scenario). Not relevant for native Rust (Node context), but flag the API gap
  6. **o200k_harmony** is new (Q1 2026, gpt-oss). Parity against `js-tiktoken` only if it's implemented there — may only be testable against `tiktoken` WASM

## If NO-GO — BACKLOG entry

N/A — GO recommended with a qualified classification (Green vs. pure JS, Yellow vs. WASM).

## Phase B measurement (2026-04-19, linux-x64, Node v22)

Implemented in `crates/tiktoken/` against `tiktoken-rs 0.11`. Three baselines, three size buckets (`cl100k_base`, ops/sec, higher = better):

| Scenario | @amigo-labs/tiktoken | tiktoken (WASM) | js-tiktoken | gpt-tokenizer |
|---|---:|---:|---:|---:|
| encode 10 B (small) | **164,256 hz** | 7,006 hz | 73,907 hz | 586,445 hz |
| encode ~2 KB (medium) | **5,999 hz** | 1,445 hz | 1,698 hz | 14,855 hz |
| encode ~90 KB (large) | **126 hz** | 38 hz | 28 hz | 269 hz |
| 100 × 10 B (RAG batch) | **1,471 hz** | 67 hz | — | 4,364 hz |

Speedup matrix (>1 = we're faster):

| Scenario | vs. WASM | vs. js-tiktoken | vs. gpt-tokenizer |
|---|---:|---:|---:|
| Small | **23.4×** ✅ | **2.22×** ✅ | **0.28×** ❌ |
| Medium | **4.15×** ✅ | **3.53×** ✅ | **0.40×** ❌ |
| Large | **3.32×** ✅ | **4.48×** ✅ | **0.47×** ❌ |

**Prediction vs. reality:**
- Against `tiktoken` (WASM): predicted Yellow (~1.25×), measured **Green** (3–23×). The prediction was too pessimistic — the external benchmark ([maxim-saplin/tiktoken-bench](https://github.com/maxim-saplin/tiktoken-bench)) measured WASM against Python/Rust native, not against napi-rs. The napi-rs path is significantly cheaper than WASM bridge + wasm-bindgen marshalling.
- Against `js-tiktoken`: predicted 2.8× Green, measured **2–4.5× Green**. On target.
- Against `gpt-tokenizer`: **not anticipated** — predicted in `gpt-tokenizer.md` as "pure JS ~2.8× slower" analogous to js-tiktoken. Measured **gpt-tokenizer is 2–3× faster than us**.

**Why `gpt-tokenizer` beats us:**
- LRU merge cache in the BPE loop — repeated bigram pairs within a text are cached
- V8's JIT aggressively optimizes the hot merge loop (inline caches for the `Map` lookups)
- Pure JS has no FFI fixed costs — even our 109 ns floor shows up

**Why `js-tiktoken` is *not* that fast (even though it's also pure JS):**
- No LRU cache
- Less monomorphic hot-path structure
- On the 1-MB external bench 3× slower than Rust — that matches our measurements

**Final classification: 🟡 Yellow (mixed).** Green win vs. `tiktoken` + `js-tiktoken` (18M weekly DL combined); Red vs. `gpt-tokenizer` (1M weekly). Positioning in the README: "drop-in for tiktoken and js-tiktoken; **not** a replacement for gpt-tokenizer". 88 tests green (12 unit + 70 parity + 6 fuzz).

**Options for Phase C:**
- **C.6 algorithm:** submit the LRU merge cache upstream to `tiktoken-rs` or ship as a local wrapper — realistic 1.5–2× upside in the medium bucket
- **C.2 output type:** `encodeOrdinary` could return a `Buffer` with LE u32 instead of `Uint32Array` (BASELINE §3: ~180 ns flat vs. Uint32Array alloc). Probably <10% gain
- **Hold Yellow:** position as a "tiktoken-WASM killer" (15M weekly), ignore gpt-tokenizer users (1M weekly). Defensive recommendation

**Recommendation:** ship Yellow, only do Phase C if upstream tiktoken-rs accepts the LRU cache. The WASM user migration is the primary ROI.
