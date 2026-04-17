# Parity tests — encoding

This directory verifies that `@amigo-labs/encoding` behaves compatibly with the
upstream npm package it replaces.

## Files

- `upstream.spec.ts` — tests cloned from the upstream package, with imports
  redirected to `../index.js`. Run via `pnpm test:parity`.
- `divergences.md` — documented cases where our output differs from upstream.
  Empty if parity is 100%.
- `corpus/` — binary fixtures (only when the package processes file formats).

## Running

```bash
# from repo root:
pnpm test:parity --filter @amigo-labs/encoding

# or per-package:
cd crates/encoding && pnpm test:parity
```

## Updating

When upstream releases a new version and its tests change:

1. Update the `devDependency` version in this package's `package.json`.
2. Re-clone the relevant tests into `upstream.spec.ts`.
3. Run `pnpm test:parity` and record any new divergences.
