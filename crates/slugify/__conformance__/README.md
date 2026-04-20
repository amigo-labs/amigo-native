# Conformance — `@amigo-labs/slugify`

Verifies that `@amigo-labs/slugify` produces the same output as the
[`slugify`](https://www.npmjs.com/package/slugify) npm package when called
with `{ lower: true, strict: true }` — the option combination our API is
pre-configured to match.

## What's checked

- **`upstream.spec.ts`** — worked examples from the upstream README and a
  corpus of common inputs; every case is asserted against
  `originalSlugify(input, { lower: true, strict: true })`. Custom-separator
  behaviour is checked against `originalSlugify(input, { ...strict, replacement: sep })`.
- **`parity.spec.ts`** — table-driven cross-check covering Unicode,
  punctuation, and the handful of documented divergences.
- **`fuzz.spec.ts`** — property-based invariants (output shape, no panics,
  idempotence).
- **`divergences.md`** — the short list of cases where we intentionally
  differ from `slugify`; see [`../DIFFERENCES.md`](../DIFFERENCES.md) for the
  full rationale (CJK transliteration, Cyrillic romanization, etc.).

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/slugify test:conformance

# or per-package:
cd crates/slugify && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/slugify test:all
```

## Updating

When upstream `slugify` releases a new version:

1. Update the `devDependency` version of `slugify` in this package's
   `package.json`.
2. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md) (or [`../DIFFERENCES.md`](../DIFFERENCES.md)
   for user-facing behavioural notes).
