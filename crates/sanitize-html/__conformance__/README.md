# Conformance — `@amigo-labs/sanitize-html`

Verifies that `@amigo-labs/sanitize-html` behaves compatibly with the
[`sanitize-html`](https://www.npmjs.com/package/sanitize-html) npm package
on the core API surface (`sanitize(html, options?)`).

## What's checked

- **`upstream.spec.ts`** — vendored test-case file at
  [`upstream/test.js`](./upstream/test.js) (191 cases ported from
  `sanitize-html`'s own test suite) executed against our binding.
- **`parity.spec.ts`** — maintained cross-checks: our output must equal
  upstream's output on a curated corpus covering attributes, tag allowlists,
  href schemes, and comment/CDATA handling.
- **`fuzz.spec.ts`** — property-based invariants: no panics on random HTML
  byte strings; disallowed tags never survive; URL-scheme enforcement
  applies to every attribute position.
- **`divergences.md`** — one divergence from the upstream suite is
  documented and explained; see also [`../DIFFERENCES.md`](../DIFFERENCES.md)
  for the Hybrid-Engine design and attribute-set differences.

Current status: **225 passed / 1 skipped / 0 failing (99.6 %)** against
the vendored upstream test file (see `../DIFFERENCES.md`).

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/sanitize-html test:conformance

# or per-package:
cd crates/sanitize-html && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/sanitize-html test:all
```

## Updating

When upstream `sanitize-html` releases a new version:

1. Update the `devDependency` version of `sanitize-html` in this package's
   `package.json`.
2. Re-vendor `upstream/test.js` from the upstream repo if tests changed.
3. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md) (or in [`../DIFFERENCES.md`](../DIFFERENCES.md)
   for behavioural notes worth surfacing to callers).
