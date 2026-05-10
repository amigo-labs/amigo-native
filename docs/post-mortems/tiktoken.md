# Post-Mortem: `@amigo-labs/tiktoken`

**Status:** archived 2026-05-10. Recommending the upstream
`gpt-tokenizer` package.

## Expected gain

A native NAPI-RS wrapper around `tiktoken-rs` would beat the WASM
`tiktoken` build (OpenAI's published reference) and `js-tiktoken` (the
pure-JS sibling) on encode/decode for the cl100k_base and o200k_base
BPE tables. Hypothesis: shipping a singleton encoder class avoids the
WASM init cost and the JS regex/object-walk overhead.

## Measured gain

| Scenario | @amigo-labs/tiktoken | tiktoken (WASM) | js-tiktoken | gpt-tokenizer | vs WASM | vs js-tiktoken | vs gpt-tokenizer |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| encode small (10 B) | 344 538 Hz | 14 760 Hz | 156 692 Hz | 1 076 256 Hz | **23.34×** | **2.20×** | **0.32×** |
| encode medium (~2 KB) | 10 764 Hz | 3 035 Hz | 3 859 Hz | 36 872 Hz | **3.55×** | **2.79×** | **0.29×** |
| encode large (~90 KB) | 229 Hz | 74 Hz | 83 Hz | 721 Hz | **3.08×** | **2.76×** | **0.32×** |
| countTokens (medium) | 10 878 Hz | — | — | 39 468 Hz | — | — | **0.28×** |
| encodeMany 100 small | 2 822 Hz | 156 Hz | — | 8 959 Hz | **18.09×** | — | **0.32×** |

The hypothesis was correct against the named upstream — Green by every
column of the perf-review threshold table. The hypothesis missed
`gpt-tokenizer`, an unrelated pure-JS implementation that uses an LRU
merge cache to amortize the BPE merge step across repeated short
prompts. Against `gpt-tokenizer` the package is consistently **3.1× –
3.6× slower** at every measured input size.

## Root cause

Two compounding misses, one technical and one strategic:

1. **`tiktoken-rs` has no merge-cache.** The Rust crate computes BPE
   merges from scratch on every encode call. `gpt-tokenizer` keeps an
   LRU cache keyed on the input bytestring, so the second call with a
   common prefix (e.g. a system prompt) skips most of the merge work.
   For LLM workloads — where prompts are highly repetitive — the cache
   is the dominant lever, and Rust's per-merge speed advantage cannot
   close the gap.
2. **The "realistic median competitor" was scoped wrong.** The
   `replaces` field listed `tiktoken/js-tiktoken`. That choice
   defended the package as Green for users coming from those two
   names. But anyone searching "fastest BPE tokenizer for OpenAI on
   Node.js" in 2026 lands on `gpt-tokenizer` first (higher npm
   downloads, top SEO result). The realistic median competitor for
   the search-and-pick path is `gpt-tokenizer`, not the named upstream
   we wrap. Picking the wrong reference produced a Green-on-paper /
   Red-in-practice package.

The 2026-04-19 review was honest about the gpt-tokenizer ratio
(documented as "structurally 0.3×–0.5×, positioned as a pure-JS/WASM
killer, not a gpt-tokenizer killer") but the brand promise — "always
faster than the JS alternative on realistic inputs" — does not have a
"specific named upstream only" carve-out. Either gpt-tokenizer is a JS
alternative (it is) or the brand promise needs revision.

## Lesson

Two transferable rules from this one:

- **The realistic-median-competitor question is product-defining.**
  Pick it as a user would (downloads, SEO, "what does an LLM rec when
  asked"), not as the upstream's `replaces` field declares. Re-check
  on every quarterly review — the JS landscape moves.
- **An LRU cache in the competitor's hot path beats a SIMD merge in
  ours, every time.** When the competitor amortizes work across
  calls and we don't, no amount of per-call speed closes the gap.
  Either we fork `tiktoken-rs` to add a cache, or we walk away.
  Walking away is cheaper.

The package's Phase-D path was Path B in the re-review at
`docs/perf-review/tiktoken.md`. Path A (re-scope positioning to
`tiktoken/js-tiktoken`-only) was rejected because the `gpt-tokenizer`
ratio was already published in `docs/packages.json` and the live
README, and re-scoping by hiding numbers we already showed would have
cost more in trust than the package earned in users.

Note: `crates/text-splitters` continues to use `tiktoken-rs` directly
(as a Rust dependency, not via `@amigo-labs/tiktoken`) for its
`tiktoken:cl100k_base` / `tiktoken:o200k_base` length metrics. That is
correct and unaffected by this archival — token *counting* inside a
larger workload is a different shape from token *encoding* as the
primary product.

## Migration recipe

`@amigo-labs/tiktoken` was an encoder-class API. `gpt-tokenizer` ships
function exports per encoding. Mapping:

```js
// Before — @amigo-labs/tiktoken
import { Tiktoken } from '@amigo-labs/tiktoken'

const enc = new Tiktoken('cl100k_base')   // or 'o200k_base'
const ids = enc.encode('hello world')
const text = enc.decode(ids)
const n = enc.countTokens('hello world')
const batch = enc.encodeMany(['a', 'b', 'c'])
```

```js
// After — gpt-tokenizer
//   - cl100k_base  → 'gpt-tokenizer/encoding/cl100k_base'
//   - o200k_base   → 'gpt-tokenizer/model/gpt-4o' (or any o200k model)
import { encode, decode, countTokens } from 'gpt-tokenizer/encoding/cl100k_base'

const ids = encode('hello world')
const text = decode(ids)
const n = countTokens('hello world')
const batch = ['a', 'b', 'c'].map(encode)
```

Output IDs are identical (both wrap the same OpenAI BPE tables). No
class instance to keep around — the encoding tables load once on first
import. For per-model selection, `gpt-tokenizer` also exposes
`gpt-tokenizer/model/<name>` entry points (e.g. `gpt-4o`, `gpt-4`,
`gpt-3.5-turbo`) that pick the right encoding automatically.

