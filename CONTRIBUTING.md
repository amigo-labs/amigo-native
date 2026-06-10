# Contributing to amigo-native

Thanks for wanting to contribute. This repo is a monorepo of Rust-powered
Node.js packages under the `@amigo-labs` scope. Every crate ships as its own
npm package; the thesis of the portfolio is *"always faster than the JS
alternative on realistic inputs"*.

## Ground rules

- **Performance is non-negotiable.** Every shipped crate carries a benchmark
  suite and a verdict in [`docs/perf-review.md`](./docs/perf-review.md). A
  crate that can't stay Green on realistic medians gets deprecated — see the
  "Ported then deprecated" section of [`BACKLOG.md`](./BACKLOG.md).
- **Parity is tracked.** Drop-in / Compatible / Alternative statuses in
  [`docs/packages.json`](./docs/packages.json) must match what
  `__conformance__/upstream.spec.ts` proves. Don't upgrade a label without
  the tests to back it.
- **No new abstractions before three repeats.** Three similar call sites are
  better than a premature shared helper.

## Getting started

```bash
git clone https://github.com/amigo-labs/amigo-native
cd amigo-native
pnpm install
pnpm build          # compile every crate (release)
pnpm test           # vitest across the workspace
pnpm bench          # full benchmark suite
```

Prerequisites:

- Rust (edition 2024)
- Node.js ≥ 22
- pnpm

## Proposing a new package

Before writing any code, run the `rust-check` skill for the candidate (or
follow the same template manually and drop it at
`docs/perf-review/<name>.md`). The review must answer:

1. Is there a Rust crate that does the work?
2. Does the FFI shape admit a Green verdict? See
   [`docs/BASELINE.md`](./docs/BASELINE.md) for FFI-floor numbers — anything
   dominated by small-array marshalling, hashmap lookups, or sub-µs work per
   call is a structural Red candidate.
3. What does the upstream test suite look like? If there's no usable
   conformance corpus, the port can't claim Drop-in.

Only after the review lands with a Green/Yellow prediction does a port get
scheduled. Red predictions go into [`BACKLOG.md`](./BACKLOG.md) with the
reasoning.

## Adding a crate

```bash
./scripts/new-package.sh <name>
```

The scaffolder creates all three crates — the pure-Rust core at
`crates/_<name>-core/`, the napi binding at `crates/<name>/`, and the
WASM sub-crate at `crates/<name>/wasm/` — with the dual-target
`package.json` fields (`browser`, conditional `exports`, the five
`wasm/pkg/*` `files` entries, `build:wasm` / `build:all` / `test:wasm`,
`amigo.targets: ["node", "browser"]`) already in place. Then:

1. Implement the algorithm in `crates/_<name>-core/src/lib.rs`
   (`publish = false`, no napi / wasm-bindgen attributes). This is
   the single source of truth used by both bindings.
2. Fill in the napi surface in `crates/<name>/src/lib.rs` as a thin
   wrapper that translates `Buffer` / `BigInt` / option structs
   to/from the core types.
3. Add the test suite at `crates/<name>/__test__/` and the upstream
   conformance corpus at `crates/<name>/__conformance__/`.
4. Add benchmarks at `crates/<name>/__bench__/` that compare against the
   JS alternative you're replacing.
5. Fill in the WASM sub-crate at `crates/<name>/wasm/`, mirroring the
   slugify pilot:
   - `wasm/src/lib.rs`: `#[wasm_bindgen]` wrappers with
     `js_name = "camelCase"` to mirror the napi surface. Uncomment
     `serde-wasm-bindgen` / `serde` in `wasm/Cargo.toml` if you need
     option structs.
   - `wasm/tests/web.rs`: `wasm-bindgen-test` parity coverage.
   - In the README: flesh out the scaffolded "Install for the browser"
     section (same `import`; the bundler picks the WASM artifact).
6. Populate the `amigo` block in `crates/<name>/package.json` — then run
   `node scripts/sync-registry.mjs` to regenerate the root README table and
   `docs/packages.json` in one step. Don't edit those two files by hand.
7. Add `MIGRATION.md` if the package isn't a 100 % drop-in.
8. Add a platform-stub `npm/` directory per target (6 total — see existing
   crates). The `audit-crates` skill checks all conventions (napi stubs,
   wasm scaffolding, package.json fields).

**Default is dual-target.** A new crate should be browser-eligible unless
there is a documented exclusion reason — see [`docs/specs/expansion-2026.md`](./docs/specs/expansion-2026.md)
§ Node.js server-only tier. Joining that tier requires either a
performance perf-review entry (memory-hard / FFI-floor-dominated) or a
threat-model rationale (private-key crypto). Add the crate's name to the
`NODE_ONLY_CRATES` constant in all six spots
(`.claude/skills/audit-crates/scripts/audit.mjs`,
`scripts/sync-registry.mjs`, `scripts/build-all-wasm.mjs`,
`scripts/scaffold-wasm-bench.mjs`, `.github/workflows/ci.yml`,
`.github/workflows/release.yml`) and to the policy table in
`expansion-2026.md`.

## Changing an existing crate

- Keep the exported surface stable. If you need to rename or remove a symbol,
  document it in `MIGRATION.md` and update the crate README in the same
  commit.
- If a change moves a crate between Green/Yellow/Red, update the row in
  [`docs/perf-review.md`](./docs/perf-review.md) and the speedup cell in the
  root README.
- If you bump a dependency that changes numeric output (e.g. a hashing crate's
  seeding behaviour), bump the major version — `@amigo-labs/*` semver treats
  output drift as breaking.

## Commits and PRs

- Use conventional-commit style prefixes: `feat(<crate>):`, `fix(<crate>):`,
  `perf(<crate>):`, `docs(<area>):`, `chore(...):`, `refactor(...):`. The
  scope MUST match a crate directory name (`argon2`, `csv`, …) for that crate
  to be released — unscoped commits do not trigger any release.
- One logical change per PR. Doc-only PRs are fine on their own.
- Fill out [the PR template](.github/PULL_REQUEST_TEMPLATE.md) — in particular
  the "Benchmarks" section when you touch `crates/`.
- CI runs lint + tests + benchmarks (only on changed crates) on every push to
  `main`. Force a full rerun by putting `[full-bench]` in the merge commit.

## Filing issues

- Use the [bug report](.github/ISSUE_TEMPLATE/bug_report.yml) or
  [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) templates.
- Bug reports need a reproduction, the exact `@amigo-labs/<pkg>` version, and
  the Node version. Performance issues need a benchmark script — we'll ask
  anyway.
- For "please port package X" proposals, follow the template — it asks for
  the same gates `rust-check` checks.

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please).

1. Use scoped conventional commits, e.g. `fix(argon2): …`, `feat(csv): …`.
   Unscoped commits do NOT bump any package — they are ignored by release-please.
2. On every push to `main`, the `release-please` workflow opens or refreshes a
   single grouped Release PR titled `chore: release main` proposing per-crate
   version bumps and CHANGELOG entries.
3. Review the proposed bumps. Edit the offending commit on `main` if a type
   was misclassified, or add an empty commit scoped to the target crate with a
   `Release-As: <ver>` footer (e.g. `chore(argon2): release` + `Release-As:
   0.2.0`) to override. The scope is required — without it the override is
   ignored.
4. Merge the Release PR. release-please tags each released crate as
   `<crate>@<version>` and pushes them; this triggers `release.yml`, which
   cross-compiles for six platforms and publishes to npm with provenance.

Pre-1.0 semver: `feat:` and `feat!:` (breaking) are both minor bumps until a
crate reaches 1.0.0. Use `Release-As: 1.0.0` to graduate.

See [`docs/RELEASING.md`](./docs/RELEASING.md) for manual overrides,
troubleshooting, and the `RELEASE_PLEASE_TOKEN` secret setup.

## License

MIT. By contributing you agree your contributions are licensed under the same.
