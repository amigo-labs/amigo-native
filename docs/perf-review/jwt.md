# Perf-Review: `@amigo-labs/jwt`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0 ·
> **Targets:** `node` (Node.js server-only group)

## WASM-target exclusion

`jwt` is part of the **Node.js server-only tier** documented in
[`docs/specs/expansion-2026.md`](../specs/expansion-2026.md#nodejs-server-only-tier).
It does not ship a WASM binding, deliberately:

- **Threat model:** the sign path needs the **private signing key**.
  That key must never reach the browser, and a package that exposes both
  `sign` and `verify` from the same module makes the boundary easy to
  cross by accident. The publishing signal `import '@amigo-labs/jwt'`
  should mean "server-side".
- **Use case:** the only browser-relevant operation is decode
  (no signature check) or verify with a public/HMAC key, and `jose` /
  Web Crypto cover that without an additional WASM payload.

If a concrete verify-only browser flow appears, the right shape is a
separate `@amigo-labs/jwt-verify` package that exposes only the
decode/verify paths. Until then this package stays napi-only with
`targets: ["node"]` in the registry.



## Verdict

**1.46×–5.20× vs. `jsonwebtoken` npm** across all 6 algorithm scenarios (HS256/RS256/ES256 × sign/verify). Crypto-bound — JWT work is HMAC / RSA / ECDSA signature computation plus JSON parse/stringify, both in Rust via the `jsonwebtoken` crate (by the Keats/uuid maintainer) with a RustCrypto backend. The JS upstream uses `node:crypto` + JavaScript JSON; `node:crypto` itself is native C, but the JavaScript glue (header parsing, Base64URL, validation) is the overhead we eliminate. Clean Green shape: strings in, strings out, no chain API, no callbacks.

## Classification rationale

1. **HS256 is the biggest win** (5.20× sign, 4.33× verify). HMAC-SHA-256 is trivial (2× SHA-256 runs); all the rest of the latency is JSON parse/stringify + Base64URL + header validation. In Rust all of that is constant-low.
2. **RS256 is the smallest win** (1.59× sign, 1.46× verify). Reason: RSA sign is CPU-bound on modular exponentiation and dominates the call latency (~1 ms). Our Rust backend uses the `rsa` crate with `num-bigint` — conservative, no SIMD. JS's `node:crypto` uses OpenSSL C with more optimizations. The gain comes from everything-except-RSA.
3. **ES256 sits in the middle** (2.37× sign, 1.75× verify). Like RS256 CPU-bound on Curve25519 ops, but shorter than RSA modular exponentiation.
4. **Dual-type inputs** (`expiresIn` string durations via `ms`-package parity). This is the drop-in claim fix from `docs/follow-ups.md:15` — `expiresIn: "1h"` now works 1:1 like upstream.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/jwt | jsonwebtoken npm | Speedup |
|---|---:|---:|---:|
| sign HS256 | 186 889 Hz | 35 919 Hz | **5.20×** |
| verify HS256 | 129 690 Hz | 29 929 Hz | **4.33×** |
| sign RS256 | 1 304 Hz | 818 Hz | **1.59×** |
| verify RS256 | 24 133 Hz | 16 556 Hz | **1.46×** |
| sign ES256 | 21 389 Hz | 9 033 Hz | **2.37×** |
| verify ES256 | 12 421 Hz | 7 089 Hz | **1.75×** |

### Realistic use-case

**Authentication middleware** — an API gateway verifies a JWT per request. Verify latency is latency-critical (overhead on every user request). **Token issuance** at login — one sign call per session, latency less critical. **Service-to-service auth** (mTLS alternative) — sign + verify per hop, high volumes. Median payload: ~500 B – 2 KB token. HS256 dominates production usage in internal APIs; RS256/ES256 for third-party integrations (OIDC etc.).

### Benchmark gaps

- **PS256 (RSA-PSS) not benched.** The algorithm is supported and parity tests cover it, but the bench slot is missing.
- **EdDSA / Ed25519 not benched** — same status.
- **Large claim payload** (10 KB token) not measured. The sign side would become JSON-stringify-dominated.
- **Async path** not benched separately (if it exists — source inspection is worthwhile before v0.2).

### API surface

Based on wrapping the `jsonwebtoken` crate + drop-in parity with npm `jsonwebtoken`:

- `sign(payload, secret, options?)` — sync, returns a JWT string
- `verify(token, secret, options?)` — sync, returns a claims object
- `decode(token)` — header + payload without verification
- `expiresIn` / `notBefore` accept both `number` (seconds) and `ms`-package strings (`"1h"`, `"2 days"`, `"1.5 hours"`)

Clean drop-in label, documented in the README and `__conformance__/upstream.spec.ts`.

### Bundle / binary size

`jsonwebtoken = { ..., features with HMAC, RSA, ECDSA }` — plus RustCrypto deps. Presumably 1.5–2 MB per target (larger than the encoding crates, typical for crypto).

### FFI-overhead baseline

- HS256 sign, ~500 B payload: FFI ~300 ns (string input/output), Rust ~5 µs → 6 % FFI share.
- RS256 sign: FFI ~300 ns, Rust ~1 ms → 0.03 % FFI share. Crypto-dominant.
- All scenarios: FFI transport is negligible compared to crypto compute.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | Strings are the natural JWT form |
| C.2 | Output-type minimization | ✅ already done | — |
| C.3 | Batch API (sign/verify many) | 🟡 potential | Bulk token issuance (user-invitation sends, service-mesh rotation) could benefit from `signMany(payloads, secret)`. Not measured |
| C.4 | Stateful API (pre-loaded key) | 🟡 **potential win** | RSA key parsing is non-trivial (~50 µs for PEM). A NAPI class `Signer(key)` would amortize it. 1 ms → 0.8 ms conceivable for RS256 (RSA key setup is one part). Sprint candidate for a 2×-gate upgrade on RS256 |
| C.5 | Parallelization | ❌ not applicable | A single token is a sequential crypto call |
| C.6 | Algorithm swap (OpenSSL binding instead of RustCrypto) | 🔴 risky | The `openssl` crate would probably speed up RS256, but breaks the Rust-only shape and adds a dynamic libssl dependency. Not worth it |
| C.7 | Allocator tuning | ❌ not applicable | — |
| C.8 | Bundle-size | ✅ already done | Feature-gated crypto suite |

## Action plan

**Keep-as-is** with one potential upgrade sprint:

1. **Add PS256 + EdDSA benches** — complete the algorithm matrix.
2. **Large-payload bench** (10 KB) — measure the JSON-dominated sign side.
3. **`Signer(key)`/`Verifier(key)` class spike as Phase C.4** — if RS256 user feedback shows hot-loop usage (rotating on each request is expensive), a NAPI class could lift the gate to 2×. ~2-day sprint.

No Phase-D risk. Crypto algorithms are stable; only a `node:crypto` OpenSSL upgrade could occasionally push us to 0.9× — then `C.4` becomes more important.

## References

- Crate: `crates/jwt`
- Bench: `crates/jwt/__bench__/index.bench.ts`
- Lib: `crates/jwt/src/lib.rs`
- Cargo: `crates/jwt/Cargo.toml`
- Drop-in fix: `docs/follow-ups.md:15` (`expiresIn` string parsing)
- `docs/packages.json` speedup: `"1.46–5.2× faster"`
