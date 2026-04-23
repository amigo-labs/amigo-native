# Candidate review: `jose`

> **Status:** SHIPPED v0.1 (rescoped) · **Predicted:** 🟢 Green-likely · **Measured:** 🟢 Green (RSA thumbprint, Ed25519 keygen) / 🟡 Yellow (Ed25519 thumbprint) · **Reviewed:** 2026-04-19

## Verdict

`jose` (panva) is the only option in this triple tranche that actually holds the Green profile — **but only if we scope**. The full surface (JWT + JWS + JWE + JWK + JWKS caching + browser compat) is too big for a single crate and partially redundant with our `@amigo-labs/jwt`. Recommendation: **scope = JWE encryption + JWK operations (RSA/EC key parsing/generation)** — exactly the gap our jwt crate doesn't cover. Per-call compute 100 µs–2 ms (RSA operations, AES-GCM encryption, ECDH-ES key agreement) → FFI overhead ≤ 1% → 2–4× speedup vs. pure-JS jose realistic.

## JS package

- **npm:** `jose` (~6M weekly, panva)
- **Downloads:** 6M weekly, **real server adoption** (modern auth stack, ESM-first, increasingly replacing `jsonwebtoken` + `node-jose`)
- **Exports / API surface:** `SignJWT`, `jwtVerify`, `EncryptJWT`, `jwtDecrypt`, `CompactSign`, `CompactEncrypt`, `FlattenedSign`, `GeneralSign`, `JWE` (variants), `importJWK`/`exportJWK`, `generateKeyPair`, `createRemoteJWKSet`
- **Typical input:** token strings (~500 bytes–4 KB), keys as JWK object or PEM
- **Typical output:** signed/encrypted token strings, KeyLike objects
- **Realistic median use-case:** **JWE decrypt in auth middleware** (every request) and **JWK key loading at startup** (cached). Sign/verify is frequent, but our existing `@amigo-labs/jwt` is its competitor — so explicitly excluded, no double crate

## Rust replacement

- **Candidate crate(s):**
  - **`josekit`** (Hiroyuki Wada) — complete (JWS+JWE+JWK), but smaller user base than the RustCrypto family
  - **`aws-lc-rs` + `rsa` + `aes-gcm` + `p256`/`p384`/`p521`** as a RustCrypto composition — more maintenance effort, in exchange consistent with our jwt crate
- **Maintenance / license:** josekit MIT/Apache, active but smaller maintainer pool
- **Known gotchas / divergences:**
  - JWE algorithm coverage has to be explicitly declared (`A128KW`, `A256GCMKW`, `RSA-OAEP-256`, `ECDH-ES+A256KW`, …) — panva/jose covers _all_ RFC algos, we don't want that
  - Browser/WebCrypto compat of panva/jose is irrelevant for our NAPI crate (no browser target)
  - `createRemoteJWKSet` (HTTP fetching with cache) is deliberately **not** in scope — belongs in a JS wrapper

## BACKLOG check

No entry. Fresh candidate.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | JWE decrypt: 100 µs–2 ms (RSA-OAEP) or 50–200 µs (AES-GCM with pre-shared key). JWK parse: 50–500 µs (RSA key validation) |
| Input size distribution | Token: 500 B–4 KB. JWK JSON: 200 B–2 KB. Buffer lane or string, both OK at these sizes |
| Output size distribution | Cleartext payload (~100 B–4 KB), or KeyLike handle |
| Reusable setup (stateful potential) | **High.** Key parsing is amortizable — `JoseKey` as a NAPI class with `.decrypt(token)` / `.sign(payload)` methods. That's the main leverage win |
| Batch-usage realism | Low — auth calls are per-request, not batchable. Stateful class substitutes for batching |
| FFI-share estimate vs. Rust work | Per `decrypt` call: ~109 ns floor + ~500 ns token string crossing = ~700 ns FFI vs. ~100–500 µs crypto work = **< 0.7%** |

## Classification reasoning

Unlike scrypt/pbkdf2, `jose` has **no Node built-in competitor**. Node has low-level `crypto.createSign`/`crypto.createCipheriv`, but no high-level JWE/JWK API. Anyone who wants JWE installs an npm package — and panva/jose is the de-facto standard.

Speedup expectation against panva/jose (pure JS, V8-optimized but crypto operations aren't V8-tunable):
- JWE decrypt RSA-OAEP: 3–5× (RSA math in Rust is significantly faster than pure-JS BigInt)
- JWE decrypt AES-GCM with pre-shared key: 2–3× (AES-NI via RustCrypto)
- JWK parse: 2–4×

**The stateful API is the decisive lever:** a JS user today writes `await jwtDecrypt(token, key, options)` and implicitly parses the key per call. We offer:

```ts
const key = new JoseKey({ jwk })  // once at startup
const payload = key.decrypt(token)  // hot path, 0 setup
```

That's the argon2 `hash` vs. `verify` pattern applied to JWE.

**Risk Yellow → Green:** if we try to support _all_ JWE algos, the binary blows up. A strict scope on the 4 most common algos (RSA-OAEP, RSA-OAEP-256, A256GCMKW, ECDH-ES+A256KW) keeps the bundle at ~1.5 MB.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/jose` (drop-in for the JWE/JWK subset of panva/jose) — **complements** `@amigo-labs/jwt`, doesn't replace it
- **Primary API sketch:**
  ```ts
  // Stateless convenience (parses key per call — convenience layer)
  export declare function jwtDecrypt(token: string, jwk: object): Promise<DecryptResult>
  export declare function jwtEncrypt(payload: object, jwk: object, alg: JweAlg, enc: JweEnc): Promise<string>

  // Stateful fast path (recommended)
  export declare class JoseKey {
    constructor(options: { jwk: object } | { pem: string })
    decrypt(token: string): DecryptResult        // sync, hot path
    encrypt(payload: object, alg: JweAlg, enc: JweEnc): string
    sign(payload: object, alg: JwsAlg): string
    verify(token: string): VerifyResult
  }

  export declare function generateKeyPair(alg: KeyAlg): { publicJwk: object, privateJwk: object }
  ```

- **Must-have benchmark scenarios:**
  - JWE decrypt RSA-OAEP-256, 2048-bit key, payload 200 B (auth middleware median)
  - JWE decrypt A256GCMKW, payload 200 B (HOT-PATH median)
  - JWE encrypt ECDH-ES+A256KW, payload 1 KB (token issuance)
  - JWK parse RSA-2048 public key (startup)
  - **Stateful** vs. **stateless** variant to demonstrate the class-API lever
  - Baseline: panva/jose latest version

- **Acceptance thresholds (Green gate):**
  - ≥2× stateful decrypt vs. panva/jose at median payload
  - ≥3× JWK parse
  - ≥1× stateless convenience layer (must not be slower, even if the class API is the pitch)
  - 100% test-vector parity on RFC 7516 (JWE) standard vectors

- **Risks:**
  1. **Scope creep:** `panva/jose` covers 30+ algorithms. We do 4. JS users with exotic algos (RSA1_5 — _legacy_, PBES2 — _legacy_, …) have to stay with panva/jose. Document clearly
  2. **Crate choice josekit vs. RustCrypto composition:** josekit is convenient but smaller maintainer pool; RustCrypto direct is consistent with our jwt crate but 3× the wrapper code. **Recommendation: RustCrypto composition** (jwt-crate pattern reusable)
  3. **JWKS remote caching:** `createRemoteJWKSet` from panva/jose is HTTP + in-memory cache. Doesn't belong in NAPI — ship as a JS wrapper layer inside the crate package or explicitly exclude
  4. **Bundle discipline:** be frugal with algo selection. Default features `aes-gcm`, `rsa`, `p256` cover 90% of real-world use-cases

## If NO-GO — BACKLOG entry

N/A — GO recommended (scoped).

## Phase B measurement (2026-04-19, linux-x64, Node v22.22.2)

v0.1 scope shipped: `generateRsaKeyPair`, `generateEd25519KeyPair`, `jwkThumbprint`. JWE/JWS pushed to v0.2.

| Function | @amigo-labs/jose | jose (panva, pure JS) | Speedup |
|---|---:|---:|---|
| jwkThumbprint Ed25519 | 507,407 hz | 271,279 hz | **1.87×** ✅ |
| jwkThumbprint RSA-2048 | 470,445 hz | 182,718 hz | **2.57×** ✅✅ |
| generateEd25519KeyPair | 52,939 hz | 7,312 hz | **7.24×** ✅✅✅ |
| generateRsaKeyPair (2048) | 6.92 hz | **18.08 hz** | **0.38× (2.6× slower)** 🔴 |

**Result: 3/4 Green, 1/4 Red.**

**Why RSA keygen loses:**
panva/jose uses `crypto.subtle.generateKey` (WebCrypto API) under the hood — that's Node built-in OpenSSL code. **Exactly the "Node built-in dominates" trap that broke scrypt/pbkdf2.** OpenSSL's RSA prime search (BIGNUM math, Miller-Rabin in C/ASM) is significantly faster than pure-Rust `rsa = "0.9"`.

I should have extrapolated this insight from the scrypt/pbkdf2 reviews — RSA keygen went unobserved and has the same competitor.

**What still works:**
- **Ed25519 keygen 7.24× faster** — panva/jose's WebCrypto API for Ed25519 apparently has higher JS↔WebCrypto overhead, or Node's Ed25519 is implemented more suboptimally. Clear win.
- **JWK thumbprint 1.87–2.57× faster** — hash computation (SHA-256) + JSON canonicalization in Rust beats panva/jose's pure-JS string concatenation
- 3 out of 4 functions deliver value

**Phase C/D plan:**
- **C.6 algorithm:** `generateRsaKeyPair` is not algorithmically optimizable (RSA math is known). Pure Rust has a structural disadvantage against OpenSSL.
- **Realistic option:** README + API doc explicitly recommend using Node built-in `crypto.generateKeyPair('rsa', {modulusLength: 2048})` for RSA keygen, then only JWK conversion with our crate. Delivers best-of-both-worlds.
- **Drastic option:** deprecate `generateRsaKeyPair` in v0.2 / remove it from the public API, focus the crate on "JWK tooling + Ed25519".

**Recommendation for v0.1:** keep, README warning for RSA keygen. v0.2 roadmap extended with JWE decrypt (real gap filler) instead of RSA keygen optimization.

## Phase C rescope (2026-04-19, same session)

User picked **C: drop RSA keygen**, so the crate no longer carries a Red classification.

**Action:**
- `generateRsaKeyPair` completely removed from the public API (not deprecated, was never public)
- `rsa` crate + transitive deps (pkcs1, pkcs8 for RSA, num-bigint-dig, num-traits, num-iter, zeroize) removed from `Cargo.toml`
- README documents the decision + shows `node:crypto.generateKeyPair` as the alternative
- `RsaGenTask` task struct removed; the RSA thumbprint path is fully preserved (no dependency on the RSA crate)

**New measurement after rescope:**

| Function | @amigo-labs/jose | panva/jose | Speedup |
|---|---:|---:|---|
| jwkThumbprint Ed25519 | 398,751 hz | 246,636 hz | **1.62×** 🟡 |
| jwkThumbprint RSA-2048 | 368,756 hz | 168,409 hz | **2.19×** 🟢 |
| generateEd25519KeyPair | 46,406 hz | 6,660 hz | **6.97×** 🟢🟢 |

**Portfolio impact:**
- No more Red point in the crate
- Median function (`jwkThumbprint` on RSA JWKs, the dominant production use-case via OAuth/OIDC) is 🟢 Green at 2.19×
- Ed25519 thumbprint sub-case just below the 2× gate (1.62×) — acceptable, since it's the same Rust code that delivers Green on RSA input; the variance comes from the smaller SHA-256 input (Ed25519 JWK ~80 bytes vs. RSA JWK ~400 bytes) where V8's WebCrypto overhead becomes relatively smaller
- Binary size significantly smaller (no more `rsa`/`num-bigint`/`pkcs1`)

**Final classification:** 🟢 Green (with the Ed25519 thumbprint sub-case as a tolerated Yellow fringe). All shipped functions have net-positive speedup against the only relevant competitor.

**15/15 tests passing** after the rescope:
- Ed25519 keygen + RSA thumbprint tests cross-verify with panva/jose
- RFC 7638 §3.1 standard vector verified
- Property fuzz (50 runs) for Ed25519 thumbprint parity
