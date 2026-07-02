# status

Working dashboard. Source of truth for "what is in flight, what was just shipped,
what to pick up next." Updated as work moves.

> **Last updated:** 2026-07-02
> **Active branch:** `claude/code-review-optimization-xhk4ft` (deep-fixup session)

---

## In flight

### Deep-fixup session (2026-07-02)

Repo-wide audit → fix pass on `claude/code-review-optimization-xhk4ft`.
Release automation gap closed (8 crates — fuse, jimp, jpeg-js,
linkify-it, pixelmatch, pngjs, tldts, zstd — added to the release-please
config + manifest, plus a `sync-registry --check` guard so the gap can't
recur), audit-crates checks widened (wasm/tests/web.rs, browser README
section, `files` wasm entries, declared `amigo.targets`, release-please
coverage), 20 German `docs/perf-review/*.md` translated to English,
crate-named perf reviews added for the 8 shipped crates that had none
(bm25, force-layout, graph-layout, language-detect, pdf, sentences,
stemmer, text-splitters), the `pack-verify` CI step, regenerated napi
loaders, and doc-drift cleanup (README architecture note,
CONTRIBUTING sync-registry claim, perf-review.md historical header).

---

## Recently shipped

| Date       | What                                                                      |
| :--------- | :------------------------------------------------------------------------ |
| 2026-06-10 | **Deep-fixup session**: csv option truncation + xlsx column wraparound bug fixes, dual-target `new-package.sh` template, last 8 "Install for the browser" README sections, doc-drift cleanup (PR #158, merge `8c743bf`) |
| 2026-05-28 | WASM benchmark coverage completed across crates; benchmarks regenerated (PR #151) |
| 2026-05-17 | **Dual-target expansion complete**: WASM bindings shipped for all 33 eligible crates — Batches 1–3 and all edge cases (zstd decompress-only via ruzstd, text-splitters minus tiktoken, zip, jimp, pdf, pdf-parse, xlsx, typst) (PR #134) |
| 2026-05-17 | Foundation: workspace deps, CI wasm-test + bundle-size jobs, release.yml WASM build step, audit-crates WASM checks (PR #134) |
| 2026-05-17 | Node.js server-only tier formalized: `argon2`, `jose`, `jwt` carry `targets: ["node"]` (PR #134) |
| 2026-05-17 | `expansion-2026.md` updated: scope widened from 9-crate shortlist to 33-crate dual-target tier + 3-crate Node-only tier |

---

## Next up — pick from the top

_(empty — both previous items landed in the 2026-07-02 deep-fixup
session: the `pack-verify` CI step and the napi-loader regeneration.
Pick new work from "Open decisions" below or `BACKLOG.md`.)_

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
