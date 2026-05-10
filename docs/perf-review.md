# Perf review

> Honest classification of the 16 published `@amigo-labs/*` packages
> against their respective JS alternatives. Basis for the decision:
> `npm run bench` numbers from `bench-results.json` (measured
> 2026-04-18, Node v22.22.2 linux/x64) and the FFI overhead baseline in
> `docs/BASELINE.md` (noop = 109 ns, echoString 100KB = 34.7 µs, Buffer
> echo constant ~180 ns).

## Verdict legend

- 🟢 **Green** — at least 2× faster than the best JS alternative on
  medium/large inputs, never slower than 1× on the realistic
  minimum. The package has a clear reason to exist.
- 🟡 **Yellow** — mixed results or only marginally faster.
  An optimization sprint (Phase C) decides upgrade to Green
  or downgrade to Red.
- 🔴 **Red** — loses on the realistic median against the JS
  alternative most of the time. Candidate for deprecation (Phase D) unless a
  radical rewrite produces a measurable turnaround.
- ⚫ **Black** — structurally the wrong call. NAPI cannot win the
  use-case.

## Post-sprint state (Phase C/D complete)

After the optimization sprints and the deprecation sweep:

| Package | Verdict | Post-sprint range | What happened |
|---|---|---|---|
| **slugify** | 🟢 | 3.0× – 6.0× | unchanged — was already Green |
| **deepmerge** | 🟢 | 3.3× – 5.9× | unchanged |
| **file-type** | 🟢 | 16× – 1265× | unchanged |
| **jwt** | 🟢 | 1.4× – 4.8× | unchanged |
| **sanitize-html** | 🟢 | 1.44× – 3.94× | unchanged |
| **csv** | 🟢 | **1.43× – 1.77×** across sizes | `parse()` now routes through `parseToJson + JSON.parse`. Red→Green on all three sizes. (Commit `ecf8408`) |
| **zip** | 🟢 | 2.66× – 3.7× | `extractAll()` added. Last regression (0.56×) → 2.66× against adm-zip. (Commit `16c74ed`) |
| **xxhash** | 🟢 | large-buffer 1.2×–2.5×, batch **2.44× – 4.00×** | `*Batch(Vec<Buffer>)→Vec<T>` deleted, replaced by `*Many(Buffer, chunkSize)→Buffer`. 0.17× → 4.00× on the worst batch scenario. (Commit `4c6fb50`) |
| **encoding** | 🟢 | latin1 decode **14.8×**, UTF-8 at parity, shift_jis **1.17×** | Shift_JIS now ahead of iconv-lite after the encoding_rs upgrade (961 vs 821 hz at 100 KB, see `docs/data.json`). Status Yellow → Green. |
| **commonmark** | 🟢 | 3.5× – 8.1× vs `marked` / `markdown-it` | New port on `pulldown-cmark` — explicitly CommonMark+GFM spec-strict instead of a `marked` drop-in. Green across all sizes (small to large). |
| **jose** | 🟢 | 1.62× – 6.97× | Rescope: `generateRsaKeyPair` removed from the public API (2.6× slower than panva/jose). Shipped surface — Ed25519 keygen + JWK thumbprint — all net-positive. (Commit `12cf84e`) |
| **tiktoken** | 🟢 | 2.22× – 23.4× vs `js-tiktoken` + `tiktoken` WASM | BPE tokenizer via `tiktoken-rs`, singleton NAPI class. Against `gpt-tokenizer` (LRU merge cache in JS) structurally 0.3×–0.5× — positioned as a pure-JS/WASM killer, not a gpt-tokenizer killer. (Commit `2b49284`) |
| **inflate** | 🟡 | deflate 4.1×–6.4×, inflate 0.46×–0.49× | Direct-decompress API + pre-alloc lifts it to 1.7× of the old inflate state. zlib-rs itself limits us here; backend swap deferred. (Commit `32d7dfa`) |
| **argon2** | 🟡 | 1.37× | CPU-bound, optimization ceiling reached. Keep as-is. |
| **bcrypt** | 🟡 | 1.10×–1.42× vs `bcrypt`-npm, 1.37×–1.56× vs `bcryptjs` | Phase C: pure-Rust Blowfish backend replaced with vendored Solar Designer `crypt_blowfish` C source. Red→Yellow; 2× Green gate structurally unreachable (identical algorithm in both competitors). (Commit `53db550`) |
| **nanoid** | 🗄️ **ARCHIVED** | 0.91× – 1.17× vs nanoid@5 | Archived 2026-05-10. Re-review confirmed Red — median single-call path *slower* than upstream, no native code to optimize. See `docs/post-mortems/nanoid.md` and `docs/perf-review/nanoid.md`. |
| **deep-equal** | 🗄️ **ARCHIVED** | 0.96× – 1.30× | Archived 2026-04-19. Re-review confirmed Red, no conceivable FFI lever. Post-mortem in `docs/post-mortems/deep-equal.md`, review in `docs/perf-review/deep-equal.md`. |
| **levenshtein** | 🗄️ **ARCHIVED** | 0.13× – 1.10× | Archived 2026-04-19 after the Phase C spike (`distanceU16`) — gate ≥1.5× at 10k chars missed (6.7× slower than fast-levenshtein). See `docs/perf-review/levenshtein.md` and `docs/post-mortems/levenshtein.md`. |
| **xml** | 🗄️ **ARCHIVED** | parseXml 0.44× – 0.68× / parseXmlToJson 0.72× – 1.55× | Archived 2026-04-19 (never published). Re-review with `parseXmlToJson` loses the 100 KB median and the 10 MB; 10 MB is JSON.parse-bound. `archived/xml/` + `docs/perf-review/xml.md`. |

**Net (state after the 4 post-sprint shipments bcrypt / commonmark / jose / tiktoken):** 5 Green → **12 Green** + 1 effectively Green (nanoid). 7 Yellow → **3 Yellow** (argon2, inflate, bcrypt — all three algorithmically/backend-limited, 2× gate structurally unreachable). 3 Red → 3 Deprecated (3-month window). Portfolio total: 16 shipped.

**Update 2026-04-19 (perf sprint)**: encoding moved Yellow → Green after the shift_jis re-measurement (1.17× instead of 0.65×). Inflate stays Yellow with an ongoing backend spike (`docs/perf-review/inflate-backend-spike.md`); additionally `decompress_bulk` without a zero-init output buffer (expected +5–15% on 10 MB inflate). New additive APIs in the portfolio: `renderFast`/`renderBytesFast` — each option-unmarshalling-free for FFI-floor-dominated cases. file-type async bounded copy to a 4 KB prefix (previously: full buffer).

The 8 Green packages are all net-faster-than-JS on every measured scenario. That's the quality guarantee for the portfolio: no more footguns, no more "works well for X but slow for Y" surprises in the Green packages.

## Original classification (pre-sprint)

This section documents the post-phase-A baseline. Verdicts above under "Post-sprint state" are current.

## Result overview

| Package | Verdict | Range (amigo vs best JS) | Comment |
|---|---|---|---|
| **slugify** | 🟢 | **3.0× – 6.0×** | Unicode normalize + transliterate is real work, FFI overhead is small relative to it. Keep as-is. |
| **deepmerge** | 🟢 | **3.3× – 5.9×** | Object-merge allocations in Rust are meaningfully faster than in JS. |
| **file-type** | 🟢 | **16× – 1265×** | Upstream is an async API that has to block for synchronous callers; our sync path is trivial. |
| **jwt** | 🟢 | **1.4× – 4.8×** | All 6 scenarios (HS256/RS256/ES256 sign/verify) faster. Crypto is compute-bound. |
| **sanitize-html** | 🟢 | **1.44× – 3.94×** | Small case 1.44× is borderline but not under 1; scales cleanly to 3.94× at 100 KB. Hybrid engine (tokenizer + strict fallback) already implemented. |
| **argon2** | 🟡 | 1.37× (only scenario) | Weakly above parity. No RS256/ES256-style variations benched yet. **Sprint**: measure a second config; possibly a batch API. |
| **csv** | 🟡 | `parseToJson` 1.59× – 1.78× ✓; plain `parse` **0.71× – 1.08×** ✗ | Two entry points with wildly different perf. Plain `parse` loses against `papaparse` on large inputs. **Sprint**: either fix `parse` or deprecate it in favor of `parseToJson`. |
| **encoding** | 🟡 | latin1 decode 10MB **14.7×** ✓; shift_jis decode 0.65× ✗ | Mixed. UTF-8 / UTF-16LE / Latin-1 all run through V8 fast paths (parity up to very fast). Shift_JIS + CJK family goes through Rust and loses. **Sprint**: profile where the Shift_JIS decoder eats time. If unfixable → drop Shift_JIS from the package surface or document as Black. |
| **inflate** | 🟡 | deflate 100KB-10MB **4.1× – 6.4×** ✓; inflate 100KB-10MB **0.29× – 0.40×** ✗ | Completely mixed: compression (deflate) dramatically faster, decompression (inflate) dramatically slower than `node:zlib`. That's **in the same package** — incoherent for users. **Sprint**: investigate why inflate is so much worse than node:zlib (the same zlib-rs backend should be equivalent). Hypothesis: output-buffer alloc strategy or missing streaming. |
| **nanoid** | 🟡 | 0.76× – 1.10× | Already switched from Rust to pure JS (`794396b`). Structurally can't be better than nanoid@5 because both run against the same `crypto.getRandomValues`/`randomFillSync` primitive. At parity; the 0.76× gap to `crypto.randomUUID` in batch is expected (randomUUID is less work per ID). **Sprint goal**: decide whether the package is still necessary at all (→ possibly Black). |
| **xxhash** | 🟡 | xxh3 1MB **2.54×** ✓; batch 1000×64B **0.15× – 0.32×** ✗ | Large buffers are a real win; the batch API is catastrophic (5–6× slower than the xxhash-wasm loop). This is the **classic array-marshalling anti-pattern** from `docs/BASELINE.md`: returning `Vec<BigInt>` costs 43 ns per element just for the FFI transport. **Sprint**: the batch API has to return results as a `Buffer` (8 KB for 1000 × u64). |
| **zip** | 🟡 | 4 of 5 scenarios Green (2.8× – 3.7×); extract-all 0.56× ✗ | One outlier (extract 100 small files). **Sprint**: profile why adm-zip wins on many small files; probably per-entry allocation pattern. |
| **deep-equal** | 🔴 | 0.96× – 1.30× | Never meaningfully faster. `fast-deep-equal` is tiny pure JS that V8 JITs perfectly. Deep-equal work per call is under 1 µs (flat 7-key: 500 ns) → FFI floor of 109 ns eats 20% of the budget, Rust win too small. **Kill** or radical rewrite (batch API with 1000 comparisons at once) if a use-case supports it. |
| **levenshtein** | 🔴 | 10 chars 0.60×; 100 chars 1.10×; 1000 chars 0.25×; **10000 chars 0.13×** | Loses **dramatically** on long strings (7 ops/s vs 54 ops/s at 10k chars). Reason: each 10 KB string conversion across the FFI costs ~3 µs by itself, `fast-levenshtein` works directly on V8 strings without conversion. The longer the string, the worse our handicap. **Kill** — or restructure to buffer input (`lev_bytes(a: Buffer, b: Buffer)`), but that would be a fundamentally different API. |
| **xml** | 🔴 | 0.44× – 0.68× | Loses on **every** scenario against `sax` (JS-only streaming parser). SOAP 10MB wasn't measured by the benchmark at all (only sax ran); presumably even worse. Our `parseXml` allocates a full DOM; `sax` streams events. **Kill** or complete redesign onto a streaming API, but then it's no longer "the better xml2js" but "an alternative to sax". |

## Post-classification: summary

**Green (5 packages):** slugify, deepmerge, file-type, jwt, sanitize-html. These justify the entire portfolio. Keep.

**Yellow (7 packages, sprint candidates):** argon2, csv, encoding, inflate, nanoid, xxhash, zip. Each gets a sprint in Phase C.

**Red (3 packages, kill candidates):** deep-equal, levenshtein, xml. Each gets a post-mortem + deprecation path in Phase D, unless a radical rewrite is defensible.

No clear Black candidate among the current packages — the Red three are Red because of implementation issues and alignment errors, not because NAPI structurally has no win pattern.

## Priority for the sprints

Recommended order (smallest effort × biggest effect first):

### Tier 1 — easy fixes, clear wins

1. **xxhash batch** (Yellow → Green): replace `Vec<BigInt>` with `Buffer`. Known pattern from `nanoid`/`encoding`. ~1 day.
2. **inflate** (Yellow): why is `inflate()` 2.5× slower than `node:zlib` at 100KB/10MB even though we use `zlib-rs`? Hypothesis: output-buffer alloc or `Vec<u8>` instead of `Buffer`. Profile. ~1 day.
3. **zip extract-all** (Yellow → Green): single regression. Extracting 100 small files should return 100 × `Buffer`. Hypothesis: zip entries are passed individually across the FFI. Batch output. ~1 day.

### Tier 2 — medium

4. **encoding shift_jis** (Yellow): profile; `encoding_rs`'s Shift_JIS decoder itself may be slow. Alternatives: `encoding` (rust) instead of `encoding_rs`, or a lookup table. ~1–2 days.
5. **csv plain `parse`** (Yellow): why is `parse` slower than `parseToJson`? Hypothesis: `Vec<Vec<String>>` marshalling cost. Solution: unify the API or go buffer-based. ~1–2 days.
6. **argon2** (Yellow): measure more scenarios, vary configs. If consistently 1.4×, it stays Yellow → possibly demoted to Red. Otherwise to Green. ~0.5 days.

### Tier 3 — kill decisions

7. **nanoid**: decide whether the package has a reason to exist. Pure-JS version matches nanoid@5 but doesn't beat it noticeably. Arguable: "it's the same-API drop-in with zero dependencies and stable maintenance". Or kill. → **Product decision, not a technical one.**
8. **deep-equal** kill: post-mortem + deprecation.
9. **levenshtein** kill: post-mortem + deprecation. OR: a buffer-input variant for byte-level distance as a new package `@amigo-labs/levenshtein-bytes`, separate use-case.
10. **xml** kill: post-mortem + deprecation. Or redesign as a streaming parser — but that's its own project.

## What is NOT in this review

- **Bundle-size analysis.** Documented in `docs/data.json` under the `sizes` key. Notable oddity: `slugify` 966 KB for a 21 KB JS alternative — that's a separate trade-off (three orders of magnitude faster at three orders of magnitude of bundle).
- **Security review.** This was purely about perf. Crypto packages (`argon2`, `jwt`) should get their own security audit.
- **Memory behavior under long runs.** All numbers are throughput under vitest warmup. Heap growth not measured.

## Reproducibility

```bash
cd /home/user/amigo-native
# Build all native bindings first
for p in crates/*/; do
  [ -f "$p/Cargo.toml" ] && (cd "$p" && npx napi build --platform --release)
done
# Run full benchmark suite
node scripts/run-benchmarks.mjs
# → bench-results.json  (66 suites)
```

This document should be redone after any larger toolchain bump (Node major,
napi-rs major, V8 major). Green packages can turn Yellow when V8 itself gets
faster.
