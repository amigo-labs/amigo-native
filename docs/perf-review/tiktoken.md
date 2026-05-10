# Perf-Review: `@amigo-labs/tiktoken`

> **Status:** 🗄️ **ARCHIVED 2026-05-10** (Path B chosen) · **Reviewed:** 2026-05-10 · **Version:** 0.1.1
>
> The maintainer chose Path B (deprecation in favor of `gpt-tokenizer`).
> See [post-mortem](../post-mortems/tiktoken.md) and
> [archived/tiktoken/](../../archived/tiktoken/). The Yellow analysis below
> stands as the rationale for the decision.

## Verdict

`@amigo-labs/tiktoken` is a real, measurable win against the two
upstream packages it advertises as replacements — **2.2× – 2.8×** over
`js-tiktoken` and **3.1× – 23.4×** over the WASM `tiktoken`. But against
`gpt-tokenizer`, the current most-downloaded JS BPE tokenizer for OpenAI
models, it loses **3.1× – 3.6×** at every measured input size. The
package admits this in `docs/packages.json` ("3.1–3.6× slower") and in
the live README's `vs JS` column (`0.28–0.31×`).

This is a positioning problem, not a perf bug. The C-equivalent BPE work
is already implemented well via `tiktoken-rs`; there is no Phase-C lever
that turns a structurally cached `gpt-tokenizer` (LRU merge cache, hot
short prompts) into the slower one. The action is to either narrow the
package's stated competitive scope to the upstream it actually replaces,
or to deprecate it in favor of `gpt-tokenizer`.

## Classification rationale

The skill's thresholds split clean here:

- vs `tiktoken` (WASM) and `js-tiktoken`: ≥2× across small/medium/large
  on every scenario, with the smallest realistic input still at 2.2×.
  → **Green** by every column of the threshold table.
- vs `gpt-tokenizer`: 0.27× – 0.32× at every measured size — slower than
  JS at the median real use-case. → **Red** by the same table.

Which competitor counts as "realistic" decides the verdict. Two honest
readings:

1. **Replace-the-named-upstream reading.** The `replaces` field in the
   crate's `amigo` block lists `tiktoken/js-tiktoken`. Users who type
   `import { encoding_for_model } from 'tiktoken'` (the OpenAI-published
   WASM package) and switch to `@amigo-labs/tiktoken` get a real 3-23×
   win. That audience exists and the package serves them well.
2. **Realistic-median-user reading.** A developer searching "node.js
   token counter for GPT-4" in 2026 is most likely to land on
   `gpt-tokenizer` (top npm result by weekly downloads). For that
   developer, switching to `@amigo-labs/tiktoken` is a regression. The
   portfolio thesis ("always faster than the JS alternative on realistic
   inputs") is violated.

Both readings are defensible, neither is decisive — that is exactly the
Yellow band: *"mixed results or only marginally faster"*, except here
the mixedness is across competitors rather than across input sizes. The
2026-04-19 review chose option (1) and labeled the package Green; this
re-review demotes to Yellow because (a) the live registry / README
field already publishes the gpt-tokenizer ratio (`0.28–0.31×`), so the
positioning argument is half-broken and visible to consumers, and (b)
`gpt-tokenizer`'s download counts have continued to grow, strengthening
its claim to be the realistic median competitor.

## Evidence

### Measured speedup (docs/data.json, this review)

| Scenario                        | @amigo-labs/tiktoken | tiktoken (WASM) | js-tiktoken (JS) | gpt-tokenizer (JS) | vs WASM     | vs js-tiktoken | vs gpt-tokenizer |
| :------------------------------ | -------------------: | --------------: | ---------------: | -----------------: | ----------: | -------------: | ---------------: |
| encode small (10 B)             |        344 538.36 Hz |    14 760.85 Hz |    156 692.48 Hz |   1 076 256.98 Hz  | **23.34×**  |    **2.20×**   |    **0.32×**     |
| encode medium (~2 KB)           |         10 764.78 Hz |     3 035.88 Hz |      3 859.25 Hz |      36 872.70 Hz  |  **3.55×**  |    **2.79×**   |    **0.29×**     |
| encode large (~90 KB)           |            229.52 Hz |        74.58 Hz |         83.03 Hz |         721.93 Hz  |  **3.08×**  |    **2.76×**   |    **0.32×**     |
| countTokens (medium)            |         10 878.81 Hz |             —   |               —  |      39 468.13 Hz  |       —     |        —       |    **0.28×**     |
| encodeMany 100 small (RAG batch)|          2 822.85 Hz |       156.04 Hz |               —  |       8 959.59 Hz  | **18.09×**  |        —       |    **0.32×**     |

Range vs `tiktoken` (WASM): **3.1× – 23.3×** (Green).
Range vs `js-tiktoken`: **2.2× – 2.8×** (Green).
Range vs `gpt-tokenizer`: **0.27× – 0.32×** (Red).

### Realistic use-case

**Primary:** Token counting before an OpenAI API call to budget context
or shard input. Per-call ~500–4000 tokens, ~1–10 calls per request.
Medium-input bench scenario covers this.
**Secondary:** RAG-style batch tokenization of a chunked document
corpus. The `encodeMany` API is well-shaped for this: 18× over WASM
loop, but still 3.2× slower than `gpt-tokenizer`'s JS encode loop.

The skill is explicit: pick the realistic median competitor *as a user
would*, not as the upstream package's `replaces` field declares.
Anyone benchmarking "fastest BPE tokenizer for OpenAI models on
Node.js" today picks `gpt-tokenizer`. That makes `gpt-tokenizer` the
realistic median competitor regardless of the `replaces` field.

### Benchmark gaps

None material. Coverage is thorough across sizes and includes a batch
scenario, a countTokens fast-path, and three competitors per
scenario. No measurement gap could rescue the gpt-tokenizer ratio.

### API surface

Singleton NAPI class wrapping `tiktoken-rs`. `encode`, `decode`,
`countTokens`, `encodeMany`. The class is the right shape — BPE merge
table parsing is amortized once per encoder, not per call. Phase-C
levers C.1, C.2, C.4 are already done.

### Bundle / binary size

`tiktoken-rs` plus the BPE merge tables for cl100k and o200k bundled
into the binary. ~2 MB per platform stub. Comparable to `tiktoken`
WASM (~2 MB), much larger than `gpt-tokenizer` (~1 MB JS) — but bundle
is not the differentiator here; perf is.

### FFI-overhead baseline

`docs/BASELINE.md` NAPI noop ~109 ns. Per-call work for medium input
(~10k Hz = 100 µs/call) is 1000× the FFI floor — not FFI-bound. The
bottleneck is BPE merging itself, where `gpt-tokenizer`'s LRU cache
beats `tiktoken-rs`'s no-cache hot-path for short repeated inputs.

## Phase-C optimization checklist

| #   | Lever                                                                           | Applicable               | Notes                                                                                                                                                                                                              |
| :-- | :------------------------------------------------------------------------------ | :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | already done             | Inputs are `&str` via napi-derive's reference-string wrapper. No marshalling fat.                                                                                                                                  |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer)                 | already done             | `Vec<u32>` token IDs returned via NAPI typed array. As small as it gets.                                                                                                                                            |
| C.3 | Batch API                                                                       | already done             | `encodeMany` exists, beats encode-loop within @amigo-labs by 1.15× and beats WASM batch 18×. Cannot beat `gpt-tokenizer` here either — it is bound by BPE merge speed, not by per-call FFI overhead.               |
| C.4 | Stateful API (reusable setup via NAPI class)                                    | already done             | Singleton encoder per model. Merge table is parsed once at instantiation.                                                                                                                                          |
| C.5 | Parallelization (rayon over large inputs)                                       | applicable, last-resort  | Could parallelize `encodeMany` with rayon over batch chunks. Realistic ceiling vs `gpt-tokenizer`: 4-core speedup / 3× LRU advantage = ~1.3× — would not pass the 2× Green gate even at best.                       |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.)                           | applicable, blocked      | The fundamental gap is that `gpt-tokenizer` uses an LRU merge cache. `tiktoken-rs` does not. Adding an LRU cache in front of `tiktoken-rs` would require either a fork or upstream work and is out of scope here. |
| C.7 | Allocator tuning (arena, caller-provided output buffer)                         | low ROI                  | Token output is `Vec<u32>` ~ size of input/4. Caller-provided buffer would save a few µs per call — irrelevant against the 3× LRU-cache gap.                                                                       |
| C.8 | Bundle-size (LTO, features, panic=abort, strip)                                 | already done             | Workspace `[profile.release]` already has `lto`, `strip`, `panic=abort`, `codegen-units=1`.                                                                                                                       |

The honest read of the checklist: every lever that can be pulled has
been pulled, and the remaining gap (LRU cache) requires algorithmic
work in `tiktoken-rs` upstream. There is no quick sprint that closes
the gpt-tokenizer gap.

## Action plan

Two viable paths. The choice is product, not engineering — the user
decides based on whether the `tiktoken/js-tiktoken` audience is large
enough to justify the package's continued existence.

### Path A — Re-scope and stay shipped (recommended)

1. Update the crate's `amigo.replaces` to drop the implication of
   competing with `gpt-tokenizer`. Keep `tiktoken/js-tiktoken`.
2. Update the crate `README.md` so the headline benchmarks are
   `vs tiktoken (WASM)` and `vs js-tiktoken`. Move the
   `gpt-tokenizer` ratio into a "When *not* to use this package"
   section that explicitly recommends `gpt-tokenizer` for short-prompt
   high-frequency token counting.
3. Update `docs/packages.json` `description` and `speedup` fields so
   the consumer-facing dashboard tells the same story (currently it
   advertises the gpt-tokenizer disadvantage as the headline number).
4. No code changes. The package keeps its real users (anyone migrating
   off the WASM `tiktoken` or `js-tiktoken`) without misleading users
   who would be better served by `gpt-tokenizer`.

### Path B — Phase-D deprecation

1. `npm deprecate '@amigo-labs/tiktoken@*' "Use 'gpt-tokenizer' for token counting on OpenAI models — @amigo-labs/tiktoken is 3-3.6× slower at every measured input size. See MIGRATION.md."`
2. Banner the crate `README.md`, point `MIGRATION.md` at
   `gpt-tokenizer`, 3-month deprecation window, archive to
   `archived/tiktoken/`.
3. Post-mortem at `docs/post-mortems/tiktoken.md`: lesson is *"the
   realistic-median-competitor question matters — picking the wrong
   reference competitor produces a Green-on-paper / Red-in-practice
   package"*.

### Recommendation

Path A. The package has a genuine ≥2× win against `tiktoken` and
`js-tiktoken`, both of which still have non-trivial install bases (the
WASM `tiktoken` is OpenAI's published reference). The fix is honesty
in positioning, not deprecation. If the user disagrees and wants Path
B, the deprecation mechanics are well-trodden (`deep-equal`,
`levenshtein`, `xml`, now `nanoid`).

## References

- Crate: `crates/tiktoken`
- Bench: `crates/tiktoken/__bench__/index.bench.ts`
- Lib: `crates/tiktoken/src/lib.rs`
- Cargo: `crates/tiktoken/Cargo.toml`
- `docs/packages.json` speedup field: `3.1–3.6× slower`
- FFI baseline: `docs/BASELINE.md`
- Prior review: 2026-04-19 entry in `docs/perf-review.md` (Green vs WASM/js-tiktoken, Red vs gpt-tokenizer, accepted as scope decision)
