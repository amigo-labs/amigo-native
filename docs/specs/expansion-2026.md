# Expansion 2026 — dual-target (Node + Browser) plan

> Status: **discussion draft**. Not yet approved for implementation.
> Goal: extend `amigo-native` from a Node-only crate family to a dual-target
> family (napi-rs + wasm-bindgen), so the same Rust logic ships to both
> Node and Angular/React frontends.

## Motivation

`amigo-native` currently exposes 36 published crates, all delivered as
Node.js native addons via napi-rs. That covers backend workloads and CLI
tools but leaves browser consumers untouched — and the browser is where
some of the most lucrative drop-ins live (Markdown rendering in LLM
output, HTML sanitization in pilets, client-side full-text search).

This expansion targets one architectural change:

- **Dual-target architecture** — refactor existing crates so their pure
  Rust logic lives in an internal `_<name>-core` library crate, and ship
  `wasm-bindgen` bindings alongside the existing napi-rs bindings.

> **Note on Phase 3 of the original draft.** The original draft proposed
> two new packages, `@amigo-labs/markdown` and `@amigo-labs/search`. Both
> already ship: `@amigo-labs/commonmark` (pulldown-cmark) and
> `@amigo-labs/minisearch` + `@amigo-labs/bm25` (custom BM25 over
> `_search-core`). Phase 3 is therefore dropped; the equivalent work is
> covered by adding WASM bindings to the existing crates in Phase 2.

## Current architecture

```
crates/
├── _search-core/          # internal lib crate, publish = false, no cdylib
│   └── used by minisearch + bm25 as path dep
├── _ffi-bench/            # internal helper
├── _template/             # scaffold for new packages
├── slugify/               # napi-rs cdylib + npm/<6 platforms> + tests
├── argon2/
├── xxhash/
├── sanitize-html/
├── csv/
├── commonmark/            # already exists — pulldown-cmark backed
├── minisearch/            # already exists — _search-core backed
├── bm25/                  # already exists — _search-core backed
├── … (28 more)
```

The `_search-core` pattern (Core lib + thin napi binding) is the existing
convention and the one this plan adopts. It is preferred over a nested
`crates/<name>/{core,napi,wasm}/` layout because:

- it keeps npm-package-name ↔ directory-name 1:1, matching the rest of
  the workspace;
- internal `_` prefix is already a documented marker
  (`_template`, `_ffi-bench`, `_search-core`);
- flatter trees keep CI globs and `release-please-config.json` simple.

## Target architecture

Per crate slated for dual-target:

```
crates/
├── _<name>-core/          # pure Rust logic, no binding macros
│   ├── src/lib.rs
│   └── Cargo.toml         # only the algorithm's dependencies
├── <name>/                # napi-rs binding (existing dir, slimmed)
│   ├── src/lib.rs         # #[napi] wrappers calling into core
│   ├── npm/<6 platforms>/
│   ├── __test__/  __conformance__/  __bench__/
│   └── Cargo.toml         # path dep on _<name>-core
└── <name>-wasm/           # wasm-bindgen binding (new dir)
    ├── src/lib.rs         # #[wasm_bindgen] wrappers calling into core
    ├── pkg/               # wasm-pack output (gitignored)
    ├── tests/             # wasm-bindgen-test
    └── Cargo.toml         # path dep on _<name>-core
```

### npm naming

- Node target: `@amigo-labs/<name>` (unchanged)
- Browser target: `@amigo-labs/<name>-wasm`

Rationale: separate packages keep bundling semantics obvious (no
`./browser` conditional exports magic), versioning independent if needed,
and tree-shaking trivial. Both packages can be cut at the same version
from the same release tag.

### Repository naming

`amigo-native` becomes slightly inaccurate once WASM is in the mix, but
renaming has real costs (links, npm discovery, CI URLs, badges). The
recommendation is to keep the repo name and update the README tagline to
"Rust-powered npm packages, Node + Browser". The npm scope `@amigo-labs/*`
is already neutral.

## Scope of the dual-target refactor

Not every crate is worth WASM-enabling. Selection criteria:

1. **Browser-relevant use case.** Server-only crates (e.g. `jose`, `jwt`,
   `argon2` for password verification) get little from a WASM build.
2. **Bundle size budget ≤ 500 KB gzipped.** Crates with heavy
   dependencies (`typst`, `pdf`, `jimp`) likely blow this.
3. **Performance still beats the JS incumbent.** WASM is typically
   1.5–3× slower than native and 1–10× faster than equivalent JS. CPU-
   bound crates with hot tight loops are still a win; FFI-overhead-bound
   crates may not be.

### Initial WASM-target shortlist

Ordered by combined value × tractability:

| Crate            | Replaces              | Why ship WASM                                        | Risks                                                              |
| :--------------- | :-------------------- | :--------------------------------------------------- | :----------------------------------------------------------------- |
| `slugify`        | `slugify`             | Tiny, hot in form-binding UIs                        | None significant; good pilot                                       |
| `commonmark`     | `marked`/`markdown-it`| LLM-output rendering, doc viewers                    | Bundle size of `pulldown-cmark` + html escape; expect ~200 KB gz   |
| `sanitize-html`  | `sanitize-html`/`DOMPurify` | Pilet sanitization, untrusted Markdown output | `ammonia` + `html5ever`: bundle size is the main risk (~200–400 KB)|
| `xxhash`         | `xxhash-wasm`/`xxhashjs` | Pure compute; large payloads benefit                | No SIMD by default in WASM — evaluate `+simd128`                   |
| `minisearch`     | `minisearch`          | Client-side search in pilets and docs                | Index serialization needs to be portable Node↔Browser              |
| `bm25`           | `wink-bm25-text-search` | Same as `minisearch` for finer-grained API         | Bundled into the same `_search-core` work                          |
| `linkify-it`     | `linkify-it`          | Inline link detection in chat/Markdown UIs           | Already small; should be a clean WASM target                       |
| `diff`           | `diff`                | Diff viewers in browser                              | API surface is larger; pick a subset                               |
| `csv`            | `csv-parse`           | Client-side import/export                            | Streaming API is awkward in WASM; consider keeping it sync-only    |

Explicitly **not** in initial scope:

- `argon2` — CPU-bound and ~2× slower in WASM than native. Browser
  password hashing is generally a smell (do it server-side). Revisit
  only if a concrete serverless/edge use case appears.
- `pdf`, `pdf-parse`, `jimp`, `typst`, `xlsx`, `zip`, `zstd`,
  `pixelmatch`, `jpeg-js`, `pngjs`, `inflate`, `svgo` — bundle size or
  scope makes WASM uneconomical for an initial pass.
- `jose`, `jwt` — server-side primitives; no compelling browser story.
- `force-layout`, `graph-layout` — already shipped, evaluate after
  initial pass once we have telemetry on consumer interest.
- `text-splitters`, `tldts`, `language-detect`, `stemmer`, `sentences`,
  `encoding`, `file-type`, `fuse`, `turndown`, `deepmerge` — eligible
  but not in the first wave; reassess after the shortlist ships.

This gives a first wave of **9 crates** to WASM-enable, with
`_search-core` refactored once to serve both `minisearch-wasm` and
`bm25-wasm`.

## Phase 1 — Core / binding split

Apply the `_<name>-core` pattern to the shortlist crates that don't
already have a core crate. `commonmark`, `minisearch`, `bm25` already
have or can trivially get a core crate; `slugify`, `sanitize-html`,
`xxhash`, `linkify-it`, `diff`, `csv` need the refactor.

Pilot: **slugify**, because the logic is small and the test suite is
mature. Acceptance gates per crate:

- `cargo test --workspace` green
- `pnpm test` green (existing conformance + unit tests unchanged)
- `pnpm bench` shows no regression > 5% vs. the pre-split baseline
- npm package size grows ≤ 10% (a thin wrapper shouldn't change much)

## Phase 2 — WASM bindings

Toolchain:

- `wasm-bindgen` 0.2.x
- `wasm-pack build --target bundler --release` for the primary build
  (Angular CLI and Vite ingest this directly)
- Optional secondary targets: `--target web` for `<script type="module">`
  consumers, `--target nodejs` for isomorphic test setups

Per crate:

- `crates/<name>-wasm/Cargo.toml` with `crate-type = ["cdylib"]` and
  `wasm-bindgen` dep
- Public API mirrors the napi surface where possible (same function
  names, parameter order, option struct fields). TypeScript types come
  from `wasm-bindgen`'s generated `.d.ts`; manual augmentation only
  where ergonomics require it.
- `tests/` with `wasm-bindgen-test` covering the same scenarios as the
  napi conformance suite. Headless browser execution in CI.
- README `__bench__/` snapshot vs. the replaced JS library (not vs. the
  napi build — the relevant comparison for browser consumers is against
  the incumbent JS package).

Bundle-size budget per crate: **≤ 500 KB gzipped** as a soft limit.
Overruns get documented in the crate README plus a follow-up entry in
`BACKLOG.md`; they don't block initial release.

## Phase 4 — CI & release

(Phase 3 dropped — see motivation note above.)

### CI (`.github/workflows/ci.yml`)

- Existing `cargo test --workspace` continues to cover core + napi
- Add a `wasm-test` job: `wasm-pack test --headless --chrome --firefox`
  per `<name>-wasm` crate, fanning out by matrix
- Add a `bundle-size` soft check: `wasm-pack build --release` followed
  by gzipped byte count, warn-only at first, hard-fail once budgets
  stabilize

### Release (`.github/workflows/release.yml`)

Existing tag-triggered flow stays. Add:

- For tags matching `<name>@<version>` where `<name>-wasm/` exists,
  also build and publish `@amigo-labs/<name>-wasm` at the same version
- Use `wasm-pack publish` or equivalent (`wasm-pack build --target
  bundler` + `npm publish`); keep provenance enabled for both packages
- `release-please-config.json` extended to track the `-wasm` packages
  in lockstep with their parents

### Cross-compile matrix

Unchanged for napi (6 targets). WASM is a single artifact per crate;
no matrix.

## Conformance & parity

Each `<name>-wasm` crate gets:

- A `__conformance__/` directory mirroring the napi crate's, run in
  Node via `--target nodejs` and in browsers via headless wasm-bindgen
  tests. Output parity between the two bindings is required.
- A divergences note if the WASM API has to diverge from the napi API
  (e.g. no `Buffer` in browsers; takes `Uint8Array` instead).

## Documentation

- `docs/packages.json` gains a `targets: ["node", "wasm"]` field per
  crate, surfaced in the dashboard
- Per-crate README gets an "Install for the browser" section once its
  WASM build ships
- `BENCHMARKS.md` extended with WASM-vs-JS comparison columns

## Roadmap

1. **Preparation** — this document, plus an addendum to `CLAUDE.md`
   describing the `_<name>-core` convention and the dual-target naming
2. **Phase 1, pilot** — `slugify` core/napi split, validate pattern,
   capture lessons in this doc
3. **Phase 1, rest of shortlist** — apply pattern to the remaining
   crates that need a core split (`sanitize-html`, `xxhash`,
   `linkify-it`, `diff`, `csv`)
4. **Phase 2, pilot** — `slugify-wasm` and `commonmark-wasm` in
   parallel (different complexity profiles, useful comparison)
5. **Phase 2, rest of shortlist** — remaining 7 WASM crates
6. **Phase 4** — CI and release plumbing alongside Phase 2

Phases can overlap per crate: once `slugify` finishes Phase 1, its
Phase 2 can begin independently of the other crates' Phase 1 status.

## Out of scope

- New replacement packages (the original Phase 3 — already covered by
  `commonmark`, `minisearch`, `bm25`)
- `prettier`, `jsdom`, ESLint/Stylelint plugin ports (different scope)
- Angular/React wrapper packages (consumers depend on the WASM packages
  directly)
- Cross-binding shared TypeScript types beyond what `wasm-bindgen`
  generates

## Open questions

1. **Conditional exports vs. separate packages.** The recommendation is
   separate packages (`<name>` + `<name>-wasm`). Worth a second opinion
   before locking in.
2. **`xxhash` SIMD.** Should the WASM build target `+simd128` by
   default, ship two variants, or skip SIMD? Decision contingent on
   benchmark data.
3. **`commonmark-wasm` and the XSS story.** The README must spell out
   that Markdown output is not safe by default and direct readers to
   pair it with `sanitize-html-wasm`. Where does that note live —
   crate README, dashboard, or both?
4. **Index portability for `minisearch`.** Does the WASM build need to
   read indexes serialized by the napi build, and vice versa? If yes,
   `_search-core` needs a portable on-disk format spec.
5. **Bundle-size budget enforcement.** Warn-only forever, or graduate
   to hard-fail per crate once a baseline is captured? Lean toward
   hard-fail after the first stable release.

## Success metrics

After completion of the first wave:

- 6 crates refactored into `_<name>-core` + binding (`slugify`,
  `sanitize-html`, `xxhash`, `linkify-it`, `diff`, `csv`); plus the
  three already-split search/markdown crates kept as-is
- 9 crates with a published `<name>-wasm` companion
- At least one production-shaped integration documented (e.g.
  `commonmark-wasm` + `sanitize-html-wasm` rendering LLM output in a
  pilet)
- `BENCHMARKS.md` shows WASM-vs-JS numbers for each shipped WASM crate
