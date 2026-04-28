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
- **Parity is tracked.** Drop-in / Compatible / Alternative statuses in the
  root [`README.md`](./README.md) table must match what
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

Then:

1. Implement the native surface in `crates/<name>/src/lib.rs` (napi-rs
   `#[napi]` macros).
2. Add the test suite at `crates/<name>/__test__/` and the upstream
   conformance corpus at `crates/<name>/__conformance__/`.
3. Add benchmarks at `crates/<name>/__bench__/` that compare against the
   JS alternative you're replacing.
4. Populate the `amigo` block in `crates/<name>/package.json` — then run
   `node scripts/sync-registry.mjs` to regenerate the root README table and
   `docs/packages.json` in one step. Don't edit those two files by hand.
5. Add `MIGRATION.md` if the package isn't a 100 % drop-in.
6. Add a platform-stub `npm/` directory per target (6 total — see existing
   crates). The `audit-crates` skill checks this convention.

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
  `perf(<crate>):`, `docs(<area>):`, `chore(...):`, `refactor(...):`.
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

Tagged via `<crate>@<version>` (e.g. `slugify@0.2.0`) on `main`. The release
workflow cross-compiles for six platforms and publishes with provenance — no
manual `npm publish`.

## License

MIT. By contributing you agree your contributions are licensed under the same.
