# Conformance — `@amigo-labs/pixelmatch`

This directory verifies that `@amigo-labs/pixelmatch` behaves compatibly with the
upstream npm package it replaces — or, when no direct drop-in is claimed,
that it satisfies the spec/invariants it targets.

## Files

- `parity.spec.ts` — invariants that must hold regardless of upstream: basic
  shape of output, safe defaults, algorithmic correctness on handcrafted
  inputs. Run via `pnpm test:conformance`.
- `upstream.spec.ts` — tests cloned from the upstream package (or spec
  suite) with imports redirected to `../index.js`. Run via `pnpm test:conformance`.
- `fuzz.spec.ts` — property-based tests (`fast-check`) that exercise
  invariants across random inputs: total function, no panics, safety
  properties. Run via `pnpm test:conformance`.
- `divergences.md` — documented cases where our output differs from upstream.
  Empty if parity is 100%.
- `corpus/` — binary fixtures (only when the package processes file formats).

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/pixelmatch test:conformance

# or per-package:
cd crates/pixelmatch && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/pixelmatch test:all
```

## Updating

When upstream releases a new version and its tests change:

1. Update the `devDependency` version in this package's `package.json`.
2. Re-clone the relevant tests into `upstream.spec.ts`.
3. Run `pnpm test:conformance` and record any new divergences.
