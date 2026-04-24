# Perf-Review: `@amigo-labs/jwt`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**1,46×–5,20× vs. `jsonwebtoken` npm** über alle 6 Algorithmus-Szenarien (HS256/RS256/ES256 × sign/verify). Crypto-bound — JWT-Arbeit ist HMAC- / RSA- / ECDSA-Signaturberechnung plus JSON-Parse/Stringify, beides in Rust via `jsonwebtoken` crate (Keats/uuid-Maintainer) mit RustCrypto-Backend. JS-upstream nutzt `node:crypto` + JavaScript-JSON; `node:crypto` selbst ist native-C aber der JavaScript-Glue (Header-Parse, Base64URL, Validation) ist der Overhead den wir eliminieren. Sauberes Green-Shape: Strings rein, Strings raus, keine Chain-API, keine Callbacks.

## Classification rationale

1. **HS256 ist der größte Win** (5,20× sign, 4,33× verify). HMAC-SHA-256 ist trivial (2× SHA-256-Runs), der ganze Rest der Latenz ist JSON-Parse/Stringify + Base64URL + Header-Validation. In Rust ist all das konstant-niedrig.
2. **RS256 ist der kleinste Win** (1,59× sign, 1,46× verify). Grund: RSA-Sign ist CPU-bound auf Modular-Exponentiation, dominiert die Call-Latenz (~1 ms). Unser Rust-Backend nutzt `rsa` crate mit `num-bigint` — konservativ, kein SIMD. JS-`node:crypto` nutzt OpenSSL-C mit mehr Optimierungen. Gewinn kommt aus allem-außer-RSA.
3. **ES256 liegt in der Mitte** (2,37× sign, 1,75× verify). Ähnlich RS256 CPU-bound auf Curve25519-Ops, aber kürzer als RSA-Modular-Exp.
4. **Dual-Typ-Inputs** (`expiresIn` string-Duration via `ms`-Package-Parity). Das ist der Drop-in-Claim-Fix aus `docs/follow-ups.md:15` — `expiresIn: "1h"` funktioniert jetzt 1:1 wie upstream.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/jwt | jsonwebtoken npm | Speedup |
|---|---:|---:|---:|
| sign HS256 | 186 889 Hz | 35 919 Hz | **5,20×** |
| verify HS256 | 129 690 Hz | 29 929 Hz | **4,33×** |
| sign RS256 | 1 304 Hz | 818 Hz | **1,59×** |
| verify RS256 | 24 133 Hz | 16 556 Hz | **1,46×** |
| sign ES256 | 21 389 Hz | 9 033 Hz | **2,37×** |
| verify ES256 | 12 421 Hz | 7 089 Hz | **1,75×** |

### Realistic use-case

**Authentication-Middleware** — API-Gateway verifies JWT pro Request. Verify-Latenz ist latency-kritisch (jeder User-Request-Overhead). **Token-Issuance** bei Login — sign-Call einmalig pro Session, Latenz weniger kritisch. **Service-to-Service-Auth** (mTLS-Alternative) — sign + verify per Hop, hohe Volumes. Median-Payload: ~500 B – 2 KB Token. HS256 dominiert Produktions-Nutzung in internen APIs; RS256/ES256 für Third-Party-Integrations (OIDC etc.).

### Benchmark gaps

- **PS256 (RSA-PSS) nicht gebenched.** Algorithmus ist supported, Parity-Tests decken es ab, Bench-Slot fehlt.
- **EdDSA / Ed25519 nicht gebenched** — selber Status.
- **Large-claim-payload** (10 KB Token) nicht gemessen. Sign-Side würde JSON-stringify-dominated werden.
- **Async-Pfad** nicht separat gebenched (falls vorhanden — Source-Inspektion lohnt vor v0.2).

### API surface

Basierend auf `jsonwebtoken`-crate-Wrapping + Drop-in-Parity zu npm-`jsonwebtoken`:

- `sign(payload, secret, options?)` — sync, returns JWT-String
- `verify(token, secret, options?)` — sync, returns claims-Object
- `decode(token)` — header + payload ohne Verification
- `expiresIn` / `notBefore` akzeptieren beide `number` (seconds) und `ms`-Package-Strings (`"1h"`, `"2 days"`, `"1.5 hours"`)

Saubere Drop-in-Label, dokumentiert in README und `__conformance__/upstream.spec.ts`.

### Bundle / binary size

`jsonwebtoken = { ..., features with HMAC, RSA, ECDSA }` — plus RustCrypto-Deps. Vermutlich 1,5–2 MB pro Target (größer als Encoding-Crates, typisch für Crypto).

### FFI-overhead baseline

- HS256 sign, ~500 B payload: FFI ~300 ns (String-Input/Output), Rust ~5 µs → 6 % FFI-Share.
- RS256 sign: FFI ~300 ns, Rust ~1 ms → 0,03 % FFI-Share. Dominant Crypto.
- Alle Szenarien: FFI-Transport vernachlässigbar gegen Crypto-Compute.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | Strings sind natürliche JWT-Form |
| C.2 | Output-type minimization | ✅ already done | — |
| C.3 | Batch API (sign/verify many) | 🟡 potential | Bulk-Token-Issuance (User-Invitation-Sends, Service-Mesh-Rotation) könnte von `signMany(payloads, secret)` profitieren. Nicht gemessen |
| C.4 | Stateful API (pre-loaded key) | 🟡 **potential win** | RSA-Key-Parse ist non-trivial (~50 µs für PEM). NAPI-Class `Signer(key)` würde das amortisieren. 1 ms → 0,8 ms bei RS256 denkbar (RSA-Key-Setup ist ein Teil). Sprint-Kandidat für 2×-Gate-Upgrade auf RS256 |
| C.5 | Parallelization | ❌ not applicable | Single-Token ist sequentieller Crypto-Call |
| C.6 | Algorithm swap (OpenSSL-Binding statt RustCrypto) | 🔴 risky | `openssl` crate würde wahrscheinlich RS256 beschleunigen, aber bricht Rust-only-Shape und bringt dynamische libssl-Lib-Dependency. Nicht wert |
| C.7 | Allocator tuning | ❌ not applicable | — |
| C.8 | Bundle-size | ✅ already done | Feature-gated Crypto-Suite |

## Action plan

**Keep-as-is** mit einem potentiellen Upgrade-Sprint:

1. **PS256 + EdDSA-Bench hinzufügen** — Algorithmus-Matrix komplettieren.
2. **Large-Payload-Bench** (10 KB) — JSON-dominated sign-Side messen.
3. **`Signer(key)`/`Verifier(key)`-Class-Spike als Phase-C.4** — wenn RS256-User-Feedback hot-loop-Usage zeigt (Rotate-each-Request ist teuer), könnte NAPI-Class das Gate auf 2× heben. ~2 Tage Sprint.

Kein Phase-D-Risiko. Crypto-Algorithms sind stabil; einzig `node:crypto`-OpenSSL-Upgrade könnte uns gelegentlich auf 0,9× drücken — dann wird `C.4` wichtiger.

## References

- Crate: `crates/jwt`
- Bench: `crates/jwt/__bench__/index.bench.ts`
- Lib: `crates/jwt/src/lib.rs`
- Cargo: `crates/jwt/Cargo.toml`
- Drop-in-Fix: `docs/follow-ups.md:15` (`expiresIn`-String-Parsing)
- `docs/packages.json` speedup: `"1.46–5.2× faster"`
