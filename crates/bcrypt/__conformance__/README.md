# Conformance — `@amigo-labs/bcrypt`

Verifies that `@amigo-labs/bcrypt` stays compatible with the two upstream
packages it replaces: [`bcrypt`](https://www.npmjs.com/package/bcrypt) (C++
native) and [`bcryptjs`](https://www.npmjs.com/package/bcryptjs) (pure JS).

Because `@amigo-labs/bcrypt` vendors the same `crypt_blowfish` C source
used by upstream `bcrypt`-npm (see [`docs/perf-review/bcrypt.md`](../../../docs/perf-review/bcrypt.md)),
hashes produced by any of the three implementations must be verifiable by
all three.

## What's checked

- **`parity.spec.ts`** — cross-verification against `bcrypt` and `bcryptjs`:
  1. Hashes produced by `@amigo-labs/bcrypt` verify under both upstreams.
  2. Hashes produced by each upstream verify under `@amigo-labs/bcrypt`.
  3. Output format is `$2a$`/`$2b$`/`$2y$` Modular-Crypt-Format as expected.
  4. 72-byte truncation behaviour matches the algorithm definition.
- **`fuzz.spec.ts`** — property-based invariants: `verify(hash(pw)) === true`;
  cost-factor bounds (4–31) don't panic; UTF-8 passwords round-trip.

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/bcrypt test:conformance

# or per-package:
cd crates/bcrypt && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/bcrypt test:all
```

## Updating

When either upstream releases a new version:

1. Update the `devDependency` versions of `bcrypt` and/or `bcryptjs` in this
   package's `package.json`.
2. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md).
