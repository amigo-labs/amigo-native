---
name: rust-check
description: Evaluate a single package against the amigo-native perf-review framework and decide keep-great-or-kill. Takes one package name (argument or prompted) and auto-detects the mode — an existing `crates/*` entry gets a measurement-based Green/Yellow/Red/Black classification with a Phase-C optimization plan or a Phase-D deprecation path, while an unknown npm name gets a candidate assessment with FFI-overhead heuristics, a BACKLOG check, a scan for a usable Rust crate, and a go/no-go prediction. Output is a single decision doc at `docs/perf-review/<pkg>.md`; the skill never touches crate source, benchmarks, docs/packages.json, or BACKLOG.md. Use when deciding whether to port a new npm package, when a released crate looks weak in BENCHMARKS.md, before deprecating or archiving a package, or for the quarterly re-review of already-shipped crates.
---

# rust-check

Evaluate **one** package against the amigo-native perf-review framework. Every `@amigo-labs/*` crate must be measurably faster, smaller, or safer than its JS original — this skill turns that principle into a repeatable, unsentimental decision for one package at a time.

## When to use

- Considering a new npm package to port (candidate mode)
- A released crate under-performs vs. its BENCHMARKS.md promise (review mode)
- Before deprecating or archiving a package (review mode → Phase-D plan)
- Quarterly re-review cycle — V8 moves, Rust crates improve, the calculus changes

## Two hard rules

Keep these visible while writing the review. They are the whole point.

1. **"Fast at all costs" does not count.** Synthetic-benchmark wins without a realistic median use-case are disqualifying. Always state the real use-case explicitly in the report — if the bench file only covers cherry-picked large inputs, flag it as a benchmark gap and downgrade one tier until the gap is closed.
2. **No sunk-cost.** The classification thresholds do not care how long the crate took to build. A Red is a Red.

## Classification thresholds

| Label | Criteria |
|---|---|
| 🟢 Green | ≥2× speedup at medium/large inputs AND ≥1× at the smallest realistic input; parity high. |
| 🟡 Yellow | ≥2× at large but <1× at small, or ~1.5× across the board, or bundle/startup cost eats the gain for short-lived processes. |
| 🔴 Red | <1.5× even at large, or slower than JS at the median real use-case, or parity not maintainable at acceptable cost. |
| ⚫ Black | Scope error — shape is structurally bad for NAPI (many tiny String ops in a hot path, lookup-style workloads). No input size rescues it. |

## Workflow

### Step 1 — Resolve the package name

If the user passed a name, use it. Otherwise `AskUserQuestion`: "Which package should I evaluate?". Accept `foo`, `@amigo-labs/foo`, and scoped npm names (`lodash.clonedeep`).

### Step 2 — Detect the mode

```bash
node .claude/skills/rust-check/scripts/detect-mode.mjs <name>
```

Outputs a JSON object on stdout. Key fields:

- `mode`: `"existing"` or `"candidate"`
- `cratePath`, `libRs`, `cargoToml`, `benchFile`, `readme`, `jsCompetitors` — only on existing
- `benchmarksMdSection` — the `### <name>` block from `BENCHMARKS.md` if present
- `backlogEntry` — matching line in `BACKLOG.md` if present
- `packagesJsonEntry` — registry entry if present (has advertised `speedup`)
- `baselineExists` — whether `docs/BASELINE.md` (FFI-overhead baseline) has been captured
- `existingReview` — whether `docs/perf-review/<pkg>.md` already exists (re-review)
- `reportPath` — where to write the output

Branch on `mode`.

### Step 3a — Review mode (existing crate)

Collect evidence read-only (no edits, no bench runs):

1. `libRs` — read exported `#[napi]` signatures. Note: `String` vs `&str`, `Vec<T>` vs `Buffer`, whether any state is kept, async boundaries.
2. `benchFile` — what input sizes are covered? Which JS competitor packages? Are the small/medium/large buckets all present?
3. `benchmarksMdSection` — copy verbatim into the report's Evidence section. **Do not invent numbers.** If a size is missing, list it under "Benchmark gaps".
4. `cargoToml` — which Rust crate is wrapped, which features, release profile overrides.
5. `packagesJsonEntry.speedup` — compare to the actual BENCHMARKS.md numbers. A mismatch is a red flag for the report.
6. `baselineExists` — if `false`, note that FFI-overhead estimates for the optimization plan are qualitative, not quantitative. Recommend creating the `_ffi-bench` crate as a follow-up.

Ask the user one short question if the realistic median use-case isn't obvious from the README: "What's the real-world call pattern — size, frequency, batched or not?" Don't guess. The whole review turns on this.

Apply the classification thresholds. Then walk the Phase-C levers for the chosen template table:

- **C.1 Input-type**: Does the signature take owned `String`/`Vec<T>` where `&str`/`&[T]` would do? Could a `Buffer` overload bypass UTF-8 validation?
- **C.2 Output-type**: Is a new allocation returned where a borrow, `Buffer`, or typed array would suffice?
- **C.3 Batch**: Is the call shape loop-friendly? Is there already a `fooMany` / iterator API? Target: <10% per-item overhead vs. the algorithm cost.
- **C.4 Stateful**: Is there a per-call setup cost (regex compile, schema parse, key load) that could live in a NAPI class? Rule of thumb: >20% of per-call time as setup → class API wins.
- **C.5 Parallel**: Embarrassingly parallel over large inputs? Rayon makes sense only above an empirically-determined threshold — note the threshold as "TBD" if unmeasured.
- **C.6 Algorithm**: Is there a faster Rust crate (SIMD, streaming, zero-copy)? Examples from the plan: `strsim` → `triple_accel`, `miniz_oxide` → `zlib-rs`, `serde_json` → `simd-json`.
- **C.7 Allocator**: Many small allocations → arena (`bumpalo`). Caller-provided output buffer for fill-in-place APIs.
- **C.8 Bundle-size**: Check `lto`, `codegen-units`, `strip`, `panic = "abort"`. Default features off unless used.

Mark each lever `applicable` / `not applicable` / `already done` with a concrete reason sourced from the code, not a guess.

Write the action plan based on the classification:

- **Green** — short polish list only (missing bucket in benches, maybe a batch API, README tightening).
- **Yellow** — prioritized C-lever list with explicit targets and the expected classification-upgrade path. Budget: one focused optimization sprint. If it stays Yellow after, reclassify to Red.
- **Red** — Phase-D deprecation path: (a) `deprecated` field in `package.json`, (b) README warning, (c) `MIGRATION.md` pointing to the recommended JS alternative, (d) 3-month deprecation window, (e) eventual move to `archived/`. Draft the `docs/post-mortems/<pkg>.md` outline.
- **Black** — archival plan and BACKLOG note under the appropriate rejection category.

Render the `templates/existing-review.md` template and write to `reportPath`.

### Step 3b — Candidate mode (npm package, not yet ported)

1. **Backlog check** — if `backlogEntry` is non-null, quote it to the user and ask whether to continue anyway. If they decline, stop.
2. **Evidence gathering** — use `WebFetch` / `WebSearch` if helpful:
   - npm registry for the JS package (downloads, main exports, install footprint)
   - crates.io for a suitable Rust replacement (recent release, license, maintenance)
   - Ask the user if which JS package is meant is ambiguous (e.g. `yaml` could mean `js-yaml` or `yaml`).
3. **FFI-overhead prediction** — fill the template table using the API signature:
   - Typical input/output sizes. Small strings (<100 bytes) called in a hot loop → FFI-trap warning.
   - Per-call algorithmic work. Trivial (hashmap lookup, string concat, regex over 20 chars) → likely Red/Black. Substantial (crypto, compression, parsing large documents) → candidate for Green.
   - Stateful potential. Reusable setup (key, schema, regex) is a big lever.
   - Batch realism. If callers normally loop, require a batch API in the design.
4. **Pattern-match to the post-mortem heuristics**:
   - **FFI-trap shape** (mime, dotenv, cosmiconfig, shallow clone/equal): tiny-work-per-call, output is a small primitive. Predict Red or Black.
   - **Green shape** (jwt, inflate, sanitize-html, encoding): bytes-in / bytes-out, substantial compute, streaming friendly.
   - **Unclear** (file-type-style magic-bytes, xxhash for small buffers): predict Yellow and note the benchmark scenarios that would decide it.
5. **Go / No-Go recommendation**:
   - **GO** → fill the "If GO" section: recommended crate name, API sketch (TS signature), must-have benchmark scenarios (small/medium/large, realistic median), Green-gate threshold, risks.
   - **NO-GO** → fill the "If NO-GO" section: draft `BACKLOG.md` entry under the right category (Parity too expensive / Scope too large / FFI overhead > gain / Needs a JS engine / Deprecated).

Render the `templates/candidate-review.md` template and write to `reportPath`.

### Step 4 — Summary

One or two sentences in chat: the classification (or GO/NO-GO), the single most important driver, and the report path. The user decides what happens next — this skill does not implement optimizations, deprecations, or BACKLOG edits.

## What the skill must not do

- Never modify `crates/*`, `scripts/*`, `docs/packages.json`, `BACKLOG.md`, `BENCHMARKS.md`, or `README.md`.
- Never run `vitest bench` as a side effect — benchmarks are expensive and the user owns that decision. Use numbers from `BENCHMARKS.md` only. If data is missing, say so.
- Never invent speedup numbers. "Bench gap" is a valid classification input — an unmeasured small-input bucket for a package that only bench-covers large inputs is itself a Yellow downgrade signal.
- Never commit. The user reviews the report and chooses follow-up.

## Files this skill writes

Exactly one: `docs/perf-review/<pkg>.md`. Re-reviews overwrite. Git history preserves prior versions.

## Extending

New classification levers (e.g. security reviews, supply-chain concerns) can be added to the Phase-C table in `templates/existing-review.md` and documented in the workflow. Keep `detect-mode.mjs` read-only and side-effect-free.
