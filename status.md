# status

Working dashboard. Source of truth for "what is in flight, what was just shipped,
what to pick up next." Updated as work moves.

> **Last updated:** 2026-05-15
> **Active branch:** `claude/expand-amigo-native-Q64Pf`
> **Active PR:** [#98 — docs(specs): expansion-2026 dual-target plan (draft)](https://github.com/amigo-labs/amigo-native/pull/98)

---

## In flight

### Dual-target (Node + Browser) expansion — Phase 1 + 2

Take the napi-only crate family to dual-target by shipping
`wasm-bindgen` companions in the same npm packages via conditional
exports. Full plan in [`docs/specs/expansion-2026.md`](docs/specs/expansion-2026.md).

- [x] Spec drafted and revised against the real 36-crate workspace
- [x] Architecture decisions D1–D6 locked in (see spec § Decisions)
- [x] **Pilot: slugify** — Phase 1 (core/napi split) and Phase 2
      (WASM binding inside the same npm package) end-to-end. All
      acceptance gates green. Bench: WASM 2–3× faster than JS
      `slugify`, 246 KB gzipped unoptimized (~80–120 KB after
      `wasm-opt -Oz`).
- [x] Tangential fix: `index.js` version drift across 26 crates
      (closes the `index.js` side of `docs/code-review-2026-04-25.md`
      finding #3)
- [ ] **Next crate.** Recommended order: `xxhash` (cheap pattern
      validation + answers the SIMD open question), then
      `sanitize-html` (first real bundle-budget stress test).
- [ ] WASM CI plumbing (`wasm-test` + `wasm-size` jobs, see spec § Phase 4)
- [ ] README "Install for the browser" subsection per shipping crate
- [ ] `docs/packages.json` schema extension (`targets` field) +
      dashboard surface

---

## Recently shipped

| Date       | What                                                                      |
| :--------- | :------------------------------------------------------------------------ |
| 2026-05-15 | `status.md` introduced as the working dashboard                           |
| 2026-05-15 | Fix: `index.js` version drift across 26 crates (`69116f5`)                |
| 2026-05-15 | Pilot: slugify dual-target — core/napi split + WASM binding (`53a582c`)   |
| 2026-05-13 | Spec decisions D1/D2/D3 (one-pkg conditional exports, budget, search) (`cad60b2`) |
| 2026-05-13 | Spec drafted: `docs/specs/expansion-2026.md` (`d9875ee`)                  |

---

## Next up — pick from the top

1. **Apply pilot pattern to `xxhash`.** Smallest API surface after
   slugify, pure compute, lets us collect WASM-with-SIMD vs WASM-no-SIMD
   benchmark data to close Q1 (xxhash SIMD).
2. **Apply pilot pattern to `sanitize-html`.** Highest user value
   (browser HTML sanitization is the prime use case). Highest bundle
   risk — `ammonia` + `html5ever` typically 200–400 KB gzipped.
   First real exercise of the "warn-only first" budget policy (D2).
3. **WASM CI plumbing.** Minimum: `wasm-test` job (per-crate
   `wasm-pack test --node`), `wasm-size` job (gzipped bytes after
   `wasm-opt -Oz` from system `binaryen`, warn-only per D2),
   toolchain install of `wasm32-unknown-unknown` + `wasm-pack` in CI.
4. **Follow-up PR: parent-vs-`index.js` CI guard.** One-liner in
   `scripts/sync-registry.mjs` that fails if a crate's `index.js`
   embeds a version different from its `package.json`. Prevents
   recurrence of the drift just fixed.
5. **Dashboard `targets` field.** `docs/packages.json` gains
   `targets: ["node", "browser"]` per dual-target crate; UI shows
   it. Defer until ≥ 2 crates ship WASM.

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
