# status

Working dashboard. Source of truth for "what is in flight, what was just shipped,
what to pick up next." Updated as work moves.

> **Last updated:** 2026-05-17
> **Active branch:** `claude/convert-packages-wasm-RZd3b`
> **Active PR:** [#134 — feat: ship WASM bindings for all eligible crates (draft)](https://github.com/amigo-labs/amigo-native/pull/134)

---

## In flight

### Dual-target (Node + Browser) expansion — scope widened to all eligible crates

Take the napi-only crate family to dual-target by shipping
`wasm-bindgen` companions in the same npm packages via conditional
exports. Scope: **33 of 36 public crates**; the remaining 3 form a
formal **Node.js server-only tier** (`argon2`, `jose`, `jwt`) that
intentionally stays napi-only. Full plan in
[`docs/specs/expansion-2026.md`](docs/specs/expansion-2026.md)
(updated 2026-05-17).

- [x] Spec drafted and revised against the real 36-crate workspace
- [x] Architecture decisions D1–D6 locked in (see spec § Decisions)
- [x] **Pilot: slugify** — Phase 1 (core/napi split) and Phase 2
      (WASM binding inside the same npm package) end-to-end. All
      acceptance gates green. Bench: WASM 2–3× faster than JS
      `slugify`, 246 KB gzipped unoptimized (~80–120 KB after
      `wasm-opt -Oz`).
- [x] **Foundation landed on PR #134**: workspace `[workspace.dependencies]`
      for wasm-bindgen / wasm-bindgen-test / serde-wasm-bindgen / js-sys;
      `ci.yml` gains `wasm-test` (per-crate `wasm-pack test --node`) +
      `bundle-size` (warn-only per D2) jobs; `release.yml` builds the
      in-tarball wasm/pkg/ artifact via `wasm-pack` + `wasm-opt -Oz`
      before `npm publish`; `scripts/sync-registry.mjs` propagates
      `amigo.targets` into `docs/packages.json`; audit-crates skill
      enforces the dual-target / Node-only invariants via a single
      `NODE_ONLY_CRATES = {argon2, jose, jwt}` constant.
- [x] **Node.js server-only tier landed**: argon2 / jose / jwt carry
      `targets: ["node"]` and have WASM-target exclusion sections in
      their perf-review docs.
- [x] **Batch 1 — pure-string crates (in progress)**: deepmerge,
      language-detect, stemmer, sentences, linkify-it, diff shipped
      core split + wasm sub-crate. Remaining: tldts, turndown.
- [ ] **Batch 2 — buffer crates** (xxhash, csv, encoding, file-type,
      inflate, pixelmatch, pngjs, jpeg-js, svgo)
- [ ] **Batch 3 — option-heavy + classes** (commonmark, minisearch,
      bm25, fuse, sanitize-html, force-layout, graph-layout)
- [ ] **Edge cases** (zstd via ruzstd fallback, text-splitters minus
      tiktoken on wasm32, zip, jimp, pdf, pdf-parse, xlsx, typst)
- [ ] README "Install for the browser" subsection per shipping crate
- [ ] Dashboard surface: `targets` facet in the docs/packages.json
      consumer-facing dashboard

---

## Recently shipped

| Date       | What                                                                      |
| :--------- | :------------------------------------------------------------------------ |
| 2026-05-17 | Batch 1 in-progress: WASM bindings for `deepmerge`, `language-detect`, `stemmer`, `sentences`, `linkify-it`, `diff` (PR #134) |
| 2026-05-17 | Foundation: workspace deps, CI wasm-test + bundle-size jobs, release.yml WASM build step, audit-crates WASM checks (PR #134) |
| 2026-05-17 | Node.js server-only tier formalized: `argon2`, `jose`, `jwt` carry `targets: ["node"]` (PR #134) |
| 2026-05-17 | `expansion-2026.md` updated: scope widened from 9-crate shortlist to 33-crate dual-target tier + 3-crate Node-only tier |
| 2026-05-15 | `status.md` introduced as the working dashboard                           |
| 2026-05-15 | Fix: `index.js` version drift across 26 crates (`69116f5`)                |
| 2026-05-15 | Pilot: slugify dual-target — core/napi split + WASM binding (`53a582c`)   |

---

## Next up — pick from the top

1. **Finish Batch 1**: `tldts`, `turndown` (last two pure-string crates).
2. **Batch 2 — buffer crates**: start with `xxhash` (smallest API, closes
   Q1 SIMD question once benched) and `inflate` (validates the
   `flate2`/`zlib-rs` wasm32-portable backend). Then `csv`, `encoding`,
   `file-type`, `pixelmatch`, `pngjs`, `jpeg-js`, `svgo`.
3. **Batch 3 — option-heavy + classes**: `commonmark`, `minisearch`,
   `bm25`, `fuse`, `sanitize-html` (first real bundle-budget stress test
   — `ammonia` + `html5ever` ~200–400 KB gz), `force-layout`,
   `graph-layout`.
4. **Edge cases** — `zstd` needs a `ruzstd` fallback for the WASM build
   because `zstd-sys` doesn't build for `wasm32-unknown-unknown`;
   compress / `trainDictionary` throw "not available in WASM build".
   `text-splitters` excludes tiktoken-rs on wasm32 (BPE tables ~1.5 MB).
   The bundle-heavy crates (`zip`, `jimp`, `pdf`, `pdf-parse`, `xlsx`,
   `typst`) ship with a "consider lazy import" README note.
5. **`pack-verify` CI step**: run `pnpm pack --dry-run` per dual-target
   crate and grep the file list for the expected `wasm/pkg/*` entries.
   Catches the case where `prepublishOnly` doesn't run (e.g. local
   `npm pack`) and the tarball ships without the WASM artifact.
6. **Dashboard `targets` facet** in `docs/packages.json` UI: filter
   for "browser-compatible" vs. "node-only" so consumers see the
   boundary at a glance.

---

## Open decisions / questions

Non-blocking — defer until the relevant implementation PR.

| ID   | Question                                                                       | Resolve in                          |
| :--- | :----------------------------------------------------------------------------- | :---------------------------------- |
| Q1   | `xxhash` WASM: target `+simd128` by default, ship two variants, or skip SIMD?  | `xxhash` Phase 2 PR (with benchmarks) |
| Q2   | `commonmark` WASM README: exact XSS-warning wording, dashboard surface?        | `commonmark` Phase 2 PR             |

Resolved decisions are in [`docs/specs/expansion-2026.md`](docs/specs/expansion-2026.md) § Decisions.

---

## Things deliberately not touched yet

- `CLAUDE.md` — conventions live in the spec; CLAUDE.md stays minimal
- `README.md` tagline — keep "Rust-powered npm packages" until WASM
  ships in a non-pilot crate
- `BACKLOG.md` — open items tracked here, not duplicated

---

## How to use this doc

- After landing meaningful work, move the entry from "In flight" /
  "Next up" into "Recently shipped" with a commit SHA.
- Keep "Recently shipped" trimmed to the last ~5 entries; older
  history lives in git.
- New unrelated work starts as a new section under "In flight".
- Open questions go in the table at the bottom with an explicit
  "Resolve in" target.
