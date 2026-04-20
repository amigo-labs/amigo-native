<!-- Title suggestion: <type>(<crate>): <short summary>
     where <type> is one of feat, fix, perf, docs, chore, refactor, test -->

## What changed

<!-- One or two sentences on the user-visible change. Link the issue if any. -->

## Why

<!-- The "why" rather than the "what" — what problem does this solve? -->

## Scope checklist

- [ ] This PR touches a single crate, or is a doc/CI-only change.
- [ ] Exported API surface didn't change, or `MIGRATION.md` was updated.
- [ ] `package.json` `amigo` block is accurate; `node scripts/sync-registry.mjs`
      was run if the package's metadata changed.
- [ ] Platform-stub `npm/` directories are in sync (six targets).
- [ ] `pnpm lint` and `pnpm test` pass locally.

## Benchmarks

<!-- Delete this section for doc/CI-only PRs. -->

Before / after numbers on the scenarios this PR touches. Prefer:

```
node scripts/run-benchmarks.mjs --crates <name>
```

<!-- Paste the relevant `bench-results-<name>.json` excerpt or a readable
     summary. If the verdict in `docs/perf-review.md` shifts (Green ↔ Yellow
     ↔ Red), update that file in this PR. -->

## Conformance

<!-- If you touched behaviour, point at the test that covers it. For crates
     with `__conformance__/upstream.spec.ts`, note if parity score changed. -->

## Breaking changes

<!-- If any: document in `MIGRATION.md`, bump the major. Delete this section
     if not applicable. -->
