# Candidate review: `semver`

> **Status:** NO-GO · **Predicted:** 🔴 Red leaning ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`semver` is the **textbook example** of the FFI-floor trap on high-throughput utilities: per-call compute is microseconds-small, V8 JITs the parser to near-native speed, and users call it in scattered single calls on hot paths (npm/pnpm/yarn resolvers, dependency walkers, version validation in middleware). The 109 ns FFI floor plus UTF-16↔UTF-8 conversion at both ends of the boundary is **in the same order of magnitude as the entire Rust work**. The Rust `semver` crate is ~2–3× faster than V8 `semver` in isolation, but seen through FFI that becomes 0.8×–1.2× — exactly the `mime`/`dotenv` category. Batch APIs (`satisfiesMany(versions, ranges)`) would in theory be the only lever, but usage patterns in the ecosystem are **never** batch (every npm/pnpm/yarn binding is a single call per version decision). A classic structurally-Black shape.

## JS package

- **npm:** [`semver`](https://www.npmjs.com/package/semver)
- **Downloads:** ~150M/week (Q1 2026; effectively every npm-using Node project pulls it in transitively)
- **Exports / API surface:**
  - `parse(version) → SemVer | null`, `valid(version) → string | null`, `clean(version) → string | null`
  - `inc(version, release, identifier?)`, `diff(v1, v2)`, `major/minor/patch(version)`, `prerelease(version)`, `build(version)`
  - `compare(v1, v2)`, `rcompare`, `compareLoose`, `gt`, `lt`, `eq`, `neq`, `gte`, `lte`, `cmp`
  - `satisfies(version, range, opts?)`, `maxSatisfying`, `minSatisfying`, `minVersion`, `validRange`
  - `Range` class (compiled range expression), `SemVer` class (parsed version)
  - `coerce(str)`, `subset(sub, dom)` (range subset check)
- **Typical input:**
  - Version string: `"1.2.3"`, `"^2.0.0-alpha.1+build.42"` — typically 5–30 characters
  - Range string: `"^1.0.0 || ~2.5.0"`, `">=1.2.3 <2.0.0 || =3.0.0"` — typically 5–80 characters
- **Typical output:** `boolean`, `string`, or a small object. Nothing large, but called **very frequently**.
- **Realistic median use-case:** **Package-resolver inner loop.** `pnpm install` resolves tens of thousands of `satisfies()` calls for a typical 500-dependency project (every transitive dep version against every range). Second case: **validation middleware** (`if (semver.satisfies(clientVersion, '>=2.0.0'))` in API gateways — single calls, but latency-sensitive). Third case: **version sorting** in CI tools. In none of these cases is a batch pattern natural — users simply want to write `semver.satisfies(a, b)`.

## Rust replacement

- **Candidate crate(s):**
  - [`semver`](https://crates.io/crates/semver) (Rust) — Cargo's own implementation. Excellently maintained, MIT/Apache, SIMD-free but extremely tightly written parser.
  - [`node-semver`](https://crates.io/crates/node-semver) — the npm-semver parity variant (as opposed to Cargo semver, which allows itself some liberties). Maintenance status to be verified.
  - Drop-in perspective: npm `semver` corresponds to the node-semver dialect (e.g. wildcards, `x` placeholders, caret edge cases with pre-releases). Cargo `semver` strictly follows the SemVer 2.0 spec.
- **Maintenance / license:** Rust `semver` MIT/Apache, dhwthompson & dtolnay, impeccable. The `node-semver` crate is less active; the parity effort against npm `semver` is non-trivial.
- **Known gotchas / divergences:**
  - **node-semver dialect vs. Cargo semver** — npm allows `1.x`, `1.*`, `>=1.2.3-beta.0 <1.3.0`, `~1.2`, etc. Some edge cases (e.g. pre-release semantics in caret ranges: `^1.0.0-beta.1` matches `1.0.0-beta.2` but NOT `2.0.0-beta.0`) are node-semver-specific. Full parity = use the `node-semver` crate or write our own parser.
  - **`opts.loose`, `opts.includePrerelease`, `opts.rtl`** — npm `semver` has ~5 modifier options that subtly change range semantics. Parity on all of them is detail work.
  - **Performance paradox** — the Rust `semver` crate is ~2–3× faster than the V8 equivalent in an isolated microbenchmark. Seen through FFI it is ~1×.

## BACKLOG check

Existing entry in `BACKLOG.md` (section "FFI overhead > gain"): added 2026-04-21, justified with "per-call work is microseconds, 109 ns FFI floor plus UTF-conversion eats any gain." The review fully confirms this categorization — no rethink needed, just formalized with numbers.

Differentiation:
- Versus `docs/perf-review/mime.md` (⚫ Black): structurally identical — hashmap-lookup style + FFI floor dominates. Minimal difference: `semver` does a real parse (tokenize + numeric compare), `mime` is a pure hashmap. But both are FFI-floor-dominated.
- Versus `docs/perf-review/deep-equal.md` (🔴 Red): similar lesson — V8 is superbly optimized for short ops, we have no headroom.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Critically small.** `semver.satisfies("1.2.3", "^1.0.0")` ≈ 500 ns – 1.5 µs in V8 (JITted regex + string compare). Rust in isolation: ~200–500 ns. **Rust gain per call: ~300 ns – 1 µs.** |
| Input size distribution | Version strings 5–30 B, range strings 5–80 B. UTF conversion at both ends: ~30–100 ns. Additional fixed overhead. |
| Output size distribution | Returning a `boolean`: ~50 ns. For `parse()` → a SemVer object, output marshalling would be 200–400 ns (object with major/minor/patch/prerelease/build). Dominates on parse calls. |
| Reusable setup (stateful potential) | **Exists.** Compiling `new Range("^1.0.0")` once + reusing it is an existing speed lever in npm `semver` itself. A Rust NAPI class `CompiledRange` would replicate that. But users **rarely** use it — the idiomatic form is `semver.satisfies(v, "^1.0.0")` with a string. A class variant would force users to rewrite their API usage. |
| Batch-usage realism | **Low.** No npm/pnpm/yarn-internal code batches ranges. There is no socialized `satisfiesMany` usage. If we introduce one, users would have to restructure their code — and that only for a 2–3× speedup. |
| FFI-share estimate vs. Rust work | **~50–80 % FFI share.** Rust work ~300 ns, FFI + UTF conversion ~250–400 ns. In single-call usage that's the end of the story. |

## Classification reasoning

`semver` is the **archetypal short-work hot-call case** from `docs/BASELINE.md:37–45`:

1. **V8 JITs semver perfectly.** npm `semver` is compact, monomorphic JavaScript — exactly the code for which V8's TurboFan pass generates the best code. No slow objects, no polymorphism, many hot functions. It even has an internal cache (`Range` compilations are memoized). The JS baseline is therefore **not slow** — in microbenchmarks ~500 ns – 1.5 µs on modern hardware.

2. **The Rust gain has no headroom.** Rust parses faster (better zero-copy, no GC), but the gap is ~300 ns – 1 µs. After the FFI floor (109 ns) + 2× UTF conversion (≈ 100 ns on a 10-byte string) = ~210 ns of fixed costs, a net gain of ~90 ns – 700 ns remains. On a 500 ns baseline call: 0.9×–2.4×. Median ≈ 1.2×. Below that, a lot tips over to <1× (UTF-conversion spike on longer strings).

3. **A batch API as a rescue is unrealistic.** The call site in the resolver inner loop is not batchable: "which version of lodash satisfies these 12 ranges?" is the question asked per node in the dependency graph — those ranges are read sequentially from parent package JSONs and checked locally. There is no point in the control flow at which 1000 ranges sit ready for matching at once.

4. **Pattern match against existing NO-GOs**:
   - `mime` (~180M, hashmap lookup) — identical FFI-floor trap
   - `dotenv` (~91M, 50-line JS parser) — identical
   - `deep-equal` (shipped, deprecated 0.2.0) — identical: short V8-native ops, FFI had no headroom

5. **Adoption alone does not compensate.** 150M downloads/week is huge, but the portfolio criterion is perf gain × adoption. At ~1× perf, the product is zero. The label "by `@amigo-labs/*`" alone is no value-add without a measurable win.

**Shape-Matching:**
- 🔁 Like `mime` (lookup + string parse, both FFI-floor territory)
- 🔁 Like `dotenv` (V8-optimized small parser)
- 🔁 Like `deep-equal` (shipped Red, measured 0.96×–1.30× → deprecated)
- ❌ Not like `commonmark` / `inflate` (substantial compute per call)
- ❌ Not like `tiktoken` (a stateful class earns amortized FFI — but semver has no comparable stateful usage in the ecosystem)

**Benchmark-gap flag:** Without a spike. If someone runs a 1-day spike and measures 1.5× on the realistic median `satisfies()` call, Yellow would be barely within reach — but unlikely. Published Rust-vs-Node microbenchmarks (Cargo team internal, community posts) consistently point to 0.9×–1.3× via NAPI.

## If GO — proposed port

Not recommended. This section exists only for completeness.

If someone nevertheless wants to attempt a spike: `satisfiesMany(versions: string[], range: string) → Uint8Array` (flat Buffer output) on a 1000-version batch would be the only realistic Green path — the measurement would have to show ≥2.5× vs. a semver loop. No other shape has a chance of winning.

## If NO-GO — BACKLOG entry

```markdown
- **semver** (~150M). Per-call work is microseconds of V8-JIT'd parse + range-compare. Rust `semver` crate is faster per-se (~2–3× isolated) but 109 ns FFI floor plus UTF-conversion eats the gain on typical `satisfies()` calls — realistic end-to-end speedup ~1.2×. Package-manager resolvers use scattered-single-call pattern; batch API would be useful but has no ecosystem uptake. Same trap as `mime`/`dotenv`/`deep-equal`. Full review: `docs/perf-review/semver.md`.
```

Section in `BACKLOG.md`: **FFI overhead > gain** — the existing entry is replaced by the line above (the initial-pass entry is already there; the review formalizes it with numbers).
