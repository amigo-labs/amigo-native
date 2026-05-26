# WASM-Performance-Coverage

## Context

Today the WASM performance of the crates is not measured systematically. State of the recherche (`docs/benchmarks/*.json` shard inspection + pipeline audit):

- **33 crates** ship WASM builds (`wasm/pkg/`, dual-target via conditional `exports` field)
- **Only 2 crates** (`slugify`, `xxhash`) have WASM bench code with `try { import('../wasm/pkg/...') }`
- **0 WASM hz entries** in the committed bench shards (`docs/benchmarks/xxhash.json` as of 2026-05-17: 19 entries, 0 with `(wasm)` suffix) because `run-benchmarks.mjs` never invokes `pnpm build:wasm` → the graceful skip path always fires
- `measure-size.mjs` only sums `.node` + `index.js` + `index.d.ts` — `wasm/pkg/*` is ignored
- WASM builds are unoptimised (`wasm-opt = false` in all `crates/*/wasm/Cargo.toml`); the npm tarball ships the unoptimised bundle too, so measured ≈ published, but it's unfair against JS competitors
- CI has a separate `bundle-size` job in `.github/workflows/ci.yml:209-297` that runs `wasm-opt -Oz` + gzip, but the numbers are not folded back into `size-results.json`
- The UI (`web/src/components/PackageCard.astro:41`, `web/src/pages/packages/[slug].astro:103`) shows a single `speedup` string from `docs/packages.json` — no napi/wasm split
- `scripts/generate-report.mjs#entryVariant()` is already variant-aware (suffix matching on `(wasm)`, `(napi)`) but no current consumer uses it

**Outcome**: WASM performance is measurable, visible and comparable everywhere — hz, bundle size, browser vs. node — as its own columns/badges in the existing dashboards.

## Approach

Seven phases, each independently deployable. Phases 1 + 2 are immediate quick wins (~1 day each), 3–6 are the roll-out, 7 is optional and needs its own PR.

### Phase 1 — WASM build before benchmarks (quick win)

**File**: `scripts/run-benchmarks.mjs`

Before the central `pnpm exec vitest bench` spawn (~line 97): for every `targetCrates` entry, check whether `crates/<c>/package.json#scripts.build:wasm` exists. If yes: run `pnpm --filter @amigo-labs/<c> run build:wasm` in parallel via `Promise.all`. Errors are non-blocking — just `console.warn('[build:wasm] <crate> failed; WASM comparators skipped')`. The script stays sync-spawn for the actual vitest invocation (no refactor).

**Effect**: the existing conditional-import blocks in the `slugify` + `xxhash` benches kick in immediately, shards produce `@amigo-labs/<name> (wasm)` entries. `generate-report.mjs` aggregates them without code changes — `entryVariant()` is already there.

### Phase 2 — `wasm-opt -Oz` for realistic bundle sizes

**Options** (trade-off build speed vs. realism):

- **A — `wasm-opt = ['-Oz']`** in `[package.metadata.wasm-pack.profile.release]` (33 Cargo.toml files). Local builds + CI become identically optimised. Downside: every local bench run waits for wasm-opt (~5–15 s per crate).
- **B — new script** `scripts/build-all-wasm.mjs`: chains `wasm-pack build --release` + `wasm-opt -Oz` selectively (only when a flag is set). The default `build:wasm` stays fast for dev; `bench:report` invokes the optimised script.

**Recommendation**: option B — avoids dev slowdown, while bench data stays realistic. A template exists in the CI `bundle-size` job at `.github/workflows/ci.yml:209-297`.

### Phase 3 — Roll out the bench pattern to 31 more crates

**Pattern** (from `crates/slugify/__bench__/index.bench.ts:10-19`):

```ts
let wasmFn: ((s: string) => string) | null = null
try {
  const mod = await import('../wasm/pkg/amigo_<name>_wasm.js')
  wasmFn = mod.<exportedName>
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm`')
}
// ...later inside describe(): if (wasmFn) bench('@amigo-labs/<name> (wasm)', ...)
```

**Mechanical via codemod**: a new `scripts/scaffold-wasm-bench.mjs` reads per crate:
- `package.json#main` → determines the napi import form
- `wasm/pkg/amigo_<name>_wasm.js` filename (dashes → underscores)
- existing `__bench__/index.bench.ts` → reads named imports + bench calls
- Patches in the conditional WASM block + mirrors every `bench(..napi..)` with `if (wasmFn) bench(..wasm..)`

**Manual review** still required per crate — `__bench__/index.bench.ts` files differ in suite shape (e.g. `xxhash` uses `beforeAll` for async init, `csv` has several named exports).

**Target set** (31 crates without WASM bench): bm25, commonmark, csv, deepmerge, diff, encoding, file-type, force-layout, fuse, graph-layout, inflate, jimp, jpeg-js, language-detect, linkify-it, minisearch, pdf, pdf-parse, pixelmatch, pngjs, sanitize-html, sentences, stemmer, svgo, text-splitters, tldts, turndown, typst, xlsx, zip, zstd. Skip: argon2 / jose / jwt (Node-only).

### Phase 4 — WASM bundle size in `measure-size.mjs`

**File**: `scripts/measure-size.mjs`

A new `measureWasmSize(crateName)` function, analogous to `measureAmigoSize`: sums `crates/<name>/wasm/pkg/*` (which matches the `package.json#files` list). Plus `measureWasmGzippedSize`: `zlib.gzipSync` over each file — equivalent to wire size.

**Schema extension** of `size-results.json`:
```jsonc
{
  "csv": {
    "amigo": { "napi": 412345, "wasm": 89012, "wasmGzipped": 34567 },
    "competitor": { "csv-parse": 1234567 }
  }
}
```

**Consumers** to update: `generate-report.mjs` (aggregate build), `render-readmes.mjs` (README table gets an extra "WASM (gzipped)" column when present).

### Phase 5 — Data schema: separate `napi` / `wasm` speedups

**Files**: `scripts/generate-report.mjs`, `docs/packages.json`, `docs/data.json`

`generate-report.mjs`'s variant matching already returns `entryVariant()` — only `computeSpeedupString()` produces a single number. Extend to:

```jsonc
"speedupDetails": {
  "napi": { "label": "12x faster", "hz": 4200, "vsJs": 12.0 },
  "wasm": { "label": "7.8x faster", "hz": 2740, "vsJs": 7.8 }
}
```

The top-level `speedup` string stays as a legacy field, defaulting to the napi value, so existing consumers keep working.

### Phase 6 — UI: make the WASM speedup badge visible

**Files**: `web/src/components/PackageCard.astro`, `web/src/pages/packages/[slug].astro`, `web/src/components/BenchmarkBars.astro`

- **`PackageCard.astro:41`**: replace the single `<span>{pkg.speedup}</span>` with two side-by-side badges, conditional on `targets`. Extract into a new `web/src/components/SpeedupBadges.astro` component (DRY).
- **`[slug].astro:103`**: the header shows both speedups next to the `TargetsPill`.
- **`BenchmarkBars.astro:42-83`**: entry rendering gets a `(napi)` / `(wasm)` sub-label with colour coding (e.g. napi = primary, wasm = secondary).
- The existing `TargetsPill.astro` stays unchanged as the availability indicator.

### Phase 7 — Real browser benchmarks (optional, larger PR)

**Motivation**: Node WASM performance != browser WASM performance. V8 browser VM, SpiderMonkey, JSC each tune WASM differently. Honest marketing of browser performance needs browser-VM data.

**Setup**:
- `pnpm add -D @vitest/browser playwright` (root devDependency)
- New `vitest.config.browser.ts`: `browser: { provider: 'playwright', enabled: true, headless: true, name: 'chromium' }`
- New root script `bench:browser` invokes vitest with that config

**Data extension**: `bench-results-<crate>.json` gains a `runner` field `"browser-chromium"` in addition to `"linux-x64"`. `generate-report.mjs` aggregates runner profiles separately. `docs/data.json` schema:
```jsonc
{
  "crate": "xxhash",
  "runners": {
    "node": { /* existing suites */ },
    "browser-chromium": { /* new suites */ }
  }
}
```

The Phase 6 UI can then optionally offer a "Browser" tab or toggle.

## Critical files

- `scripts/run-benchmarks.mjs` — Phase 1
- `scripts/build-all-wasm.mjs` (new) — Phase 2
- `scripts/scaffold-wasm-bench.mjs` (new) — Phase 3 codemod
- `scripts/measure-size.mjs` — Phase 4
- `scripts/generate-report.mjs` — Phase 5 (extend variant-aware speedup calculation)
- `crates/slugify/__bench__/index.bench.ts` — reference pattern for Phase 3
- `crates/<31>/__bench__/index.bench.ts` — Phase 3 roll-out
- `crates/*/wasm/Cargo.toml` — Phase 2 (only if option A is chosen)
- `web/src/components/PackageCard.astro`, `BenchmarkBars.astro`, `SpeedupBadges.astro` (new) — Phase 6
- `web/src/pages/packages/[slug].astro` — Phase 6
- `docs/packages.json`, `docs/data.json` — Phase 5 schema
- `vitest.config.browser.ts` (new) — Phase 7

## Reusable existing infrastructure

- `scripts/generate-report.mjs#entryVariant()` — suffix matching `(wasm)` / `(napi)`, already present, unused
- `.github/workflows/ci.yml:209-297` — the `bundle-size` job with `wasm-opt -Oz` + gzip; template for `scripts/build-all-wasm.mjs`
- `scripts/sync-registry.mjs` — loader for crate metadata, can act as the source for "who has `build:wasm`"
- `crates/_template/` — crate template; the Phase 3 codemod can drop a WASM bench template here as well
- `crates/slugify/__bench__/index.bench.ts` — more robust pattern than xxhash (try-catch instead of assume-init); use as the canonical reference

## Verification

Per phase:

| Phase | Verification |
|---|---|
| 1 | `pnpm bench --crates slugify` → `docs/benchmarks/slugify.json` contains `@amigo-labs/slugify (wasm)` entries |
| 2 | `ls -la crates/slugify/wasm/pkg/*_bg.wasm` shows ~30–50 % smaller files after `wasm-opt -Oz` |
| 3 | `pnpm bench --crates csv,fuse,bm25` → every shard has WASM entries |
| 4 | `cat size-results.json \| jq '.csv.amigo'` shows `{napi, wasm, wasmGzipped}` |
| 5 | `cat docs/packages.json \| jq '.[] \| select(.name == "csv").speedupDetails'` shows napi + wasm objects |
| 6 | `pnpm web:dev` → catalog card shows two badges per dual-target crate; detail page shows both speedups |
| 7 | `pnpm bench:browser --crates xxhash` → produces a shard with `runners.browser-chromium` data |

End-to-end once all phases are in:
- `pnpm bench:report` runs cleanly
- `pnpm web:check` green (Astro typecheck)
- Smoke: `pnpm web:dev` → WASM speedup column visible, values plausible (no 0x / NaN)
- `node .claude/skills/audit-crates/scripts/audit.mjs` stays green

## Out of scope

- Architectural changes to the crates themselves (Phase 3 only modifies bench files)
- Cross-browser comparison (Phase 7 is Chromium only; Firefox / WebKit as follow-up)
- CI integration of browser benches (Phase 7 only builds the local infrastructure; CI scheduling is its own topic)
- Performance regression alerts based on trends in `docs/history/*.jsonl` — the existing data is sufficient, alerting is separate tooling
