# Divergences — jose

> Empty if parity is 100% on the documented scope (JWK operations + Ed25519
> keygen). Entries added as divergences are found.

## Out-of-scope — intentional API gaps

These are deliberate omissions, not divergences. `@amigo-labs/jose` is
scoped tightly; use [`panva/jose`](https://www.npmjs.com/package/jose) for
any of these:

- JWE encryption/decryption (all variants).
- JWKS caching and `createRemoteJWKSet`.
- Full JWS surface (`CompactSign`, `FlattenedSign`, `GeneralSign`).
- Browser / WebCrypto interop.
- `generateRsaKeyPair` — shipped surface kept net-positive vs. panva/jose.
  See [`docs/perf-review/jose.md`](../../../docs/perf-review/jose.md).

<!--
Template for a real divergence entry:

## <short title>

- **Input:** `...`
- **Upstream (`panva/jose`):** `...`
- **@amigo-labs/jose:** `...`
- **Why:** <one or two sentences>
- **Workaround:** <if any>
-->
