# Conformance — `@amigo-labs/jose`

Verifies that `@amigo-labs/jose` is interoperable with the upstream
[`jose`](https://www.npmjs.com/package/jose) (panva) package on the narrow
surface we ship. The shipped scope is deliberately smaller than `panva/jose` —
see [`crates/jose/README.md`](../README.md).

## What's checked

- **`parity.spec.ts`** — cross-verification against `jose` (panva):
  1. JWKs we generate (`generateEd25519KeyPair`) are importable by
     `panva/jose` and usable for sign/verify round-trips.
  2. Our `jwkThumbprint` output equals `panva/jose`'s
     `calculateJwkThumbprint(..., 'sha256')` for Ed25519 and RSA JWKs.
  3. A private Ed25519 JWK round-trips through `panva/jose`'s import +
     sign + verify.
- **`fuzz.spec.ts`** — property-based invariants: generated key pairs
  always produce canonical JWKs; thumbprints are deterministic; no panics
  on malformed JWK input.

The shipped surface is **not** a general-purpose `jose` replacement. It
covers JWK operations and Ed25519 key generation — the gap our
[`@amigo-labs/jwt`](../../jwt) crate leaves open. JWE encryption, JWKS
caching, and full JWS surface are out of scope; use `panva/jose` for those.

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/jose test:conformance

# or per-package:
cd crates/jose && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/jose test:all
```

## Updating

When `panva/jose` releases a new version:

1. Update the `devDependency` version of `jose` in this package's
   `package.json`.
2. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md).
