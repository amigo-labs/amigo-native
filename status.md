# status

Working dashboard. Source of truth for "what is in flight, what was just shipped,
what to pick up next." Updated as work moves.

> **Last updated:** 2026-06-10
> **Active branch:** `claude/deep-fixup-v7j8ey` (deep-fixup session)

---

## In flight

### Deep-fixup session (2026-06-10)

Repo-wide analyze → fix pass; session record in `PLAN.md` on the branch.
Bug fixes (csv option truncation, xlsx column wraparound), the
`new-package.sh` template brought up to the dual-target convention,
the last 8 "Install for the browser" README sections, and doc-drift
cleanup (this file, NODE_ONLY_CRATES place count).

---

## Recently shipped

| Date       | What                                                                      |
| :--------- | :------------------------------------------------------------------------ |
| 2026-05-28 | WASM benchmark coverage completed across crates; benchmarks regenerated (PR #151) |
| 2026-05-17 | **Dual-target expansion complete**: WASM bindings shipped for all 33 eligible crates — Batches 1–3 and all edge cases (zstd decompress-only via ruzstd, text-splitters minus tiktoken, zip, jimp, pdf, pdf-parse, xlsx, typst) (PR #134) |
| 2026-05-17 | Foundation: workspace deps, CI wasm-test + bundle-size jobs, release.yml WASM build step, audit-crates WASM checks (PR #134) |
| 2026-05-17 | Node.js server-only tier formalized: `argon2`, `jose`, `jwt` carry `targets: ["node"]` (PR #134) |
| 2026-05-17 | `expansion-2026.md` updated: scope widened from 9-crate shortlist to 33-crate dual-target tier + 3-crate Node-only tier |

---

## Next up — pick from the top

1. **`pack-verify` CI step**: run `pnpm pack --dry-run` per dual-target
   crate and grep the file list for the expected `wasm/pkg/*` entries.
   Catches the case where `prepublishOnly` doesn't run (e.g. local
   `npm pack`) and the tarball ships without the WASM artifact.
2. **Dashboard `targets` filter facet** in the web UI: the per-package
   `TargetsPill` badge exists; add a "browser-compatible" vs. "node-only"
   filter so consumers see the boundary at a glance.
3. **Regenerate stale checked-in napi loaders**: a local `napi build` of
   csv/xlsx shows the committed `native.cjs` / `.d.ts` files lag the
   current source (version-check strings, removed doc comments). Needs a
   full `pnpm build` across all 36 packages and one sweeping commit
   (cf. `69116f5`, the earlier index.js version-drift fix).

---

## Open decisions / questions

Non-blocking — defer until the relevant implementation PR.

| ID   | Question                                                                       | Resolve in                          |
| :--- | :----------------------------------------------------------------------------- | :---------------------------------- |
| Q1   | `xxhash` WASM: target `+simd128` by default, ship two variants, or skip SIMD?  | A future `xxhash` perf PR (shipped without SIMD for now) |

Resolved decisions are in [`docs/specs/expansion-2026.md`](docs/specs/expansion-2026.md) § Decisions.
Q2 (commonmark XSS-warning wording) was resolved in the shipped
`crates/commonmark/README.md` § Safety section.

---

## How to use this doc

- After landing meaningful work, move the entry from "In flight" /
  "Next up" into "Recently shipped" with a commit SHA.
- Keep "Recently shipped" trimmed to the last ~5 entries; older
  history lives in git.
- New unrelated work starts as a new section under "In flight".
- Open questions go in the table at the bottom with an explicit
  "Resolve in" target.
