# Conformance — `@amigo-labs/argon2`

Verifies that `@amigo-labs/argon2` stays compatible with the upstream
[`argon2`](https://www.npmjs.com/package/argon2) npm package for every
output it produces.

## What's checked

- **`parity.spec.ts`** — cross-verification against the `argon2` npm package.
  Argon2 randomizes the salt on each call, so "parity" here means:
  1. Hashes produced by `@amigo-labs/argon2` verify under `argon2`-npm.
  2. Hashes produced by `argon2`-npm verify under `@amigo-labs/argon2`.
  3. Default parameters (variant = argon2id, cost, memory, parallelism) match
     the upstream defaults.
- **`fuzz.spec.ts`** — property-based (`fast-check`) invariants: `verify(hash(pw)) === true` for any UTF-8 password; no panics on binary input; cost-factor bounds don't overflow.

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/argon2 test:conformance

# or per-package:
cd crates/argon2 && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/argon2 test:all
```

## Updating

When upstream releases a new version:

1. Update the `devDependency` version of `argon2` in this package's
   `package.json`.
2. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md).
