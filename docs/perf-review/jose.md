# Candidate review: `jose`

> **Status:** SHIPPED v0.1 · **Predicted:** 🟢 Green-likely · **Measured:** 🟢 Green (3/4 Funktionen) / 🔴 Red (RSA-Keygen) · **Reviewed:** 2026-04-19

## Verdict

`jose` (panva) ist die einzige Option in dieser dreier-Tranche, die das Green-Profil tatsächlich hält — **aber nur wenn wir scopen**. Die Full-Surface (JWT + JWS + JWE + JWK + JWKS-Caching + Browser-Compat) ist zu groß für ein einzelnes Crate und teilweise redundant zu unserem `@amigo-labs/jwt`. Empfehlung: **Scope = JWE-Encryption + JWK-Operations (RSA/EC-Key-Parsing/-Generation)** — genau die Lücke, die unser jwt-Crate nicht abdeckt. Per-Call-Compute 100 µs–2 ms (RSA-Operationen, AES-GCM-Encryption, ECDH-ES-Key-Agreement) → FFI-Overhead ≤ 1 % → 2–4× Speedup vs. pure-JS jose realistisch.

## JS package

- **npm:** `jose` (~6 M weekly, panva)
- **Downloads:** 6 M weekly, **echte Server-Adoption** (modernes Auth-Stack, ESM-first, ersetzt `jsonwebtoken` + `node-jose` zunehmend)
- **Exports / API surface:** `SignJWT`, `jwtVerify`, `EncryptJWT`, `jwtDecrypt`, `CompactSign`, `CompactEncrypt`, `FlattenedSign`, `GeneralSign`, `JWE` (variants), `importJWK`/`exportJWK`, `generateKeyPair`, `createRemoteJWKSet`
- **Typical input:** Token-Strings (~500 Bytes–4 KB), Keys als JWK-Object oder PEM
- **Typical output:** Signed/encrypted Token-Strings, KeyLike Objects
- **Realistic median use-case:** **JWE-Decrypt im Auth-Middleware** (jeder Request) und **JWK-Key-Loading beim Startup** (cached). Sign/Verify ist häufig, hat aber unser bestehendes `@amigo-labs/jwt` als Konkurrent — also explizit ausklammern, kein Doppel-Crate

## Rust replacement

- **Candidate crate(s):**
  - **`josekit`** (Hiroyuki Wada) — komplett (JWS+JWE+JWK), aber kleinere Userbase als RustCrypto-Familie
  - **`aws-lc-rs` + `rsa` + `aes-gcm` + `p256`/`p384`/`p521`** als RustCrypto-Komposition — mehr Maintenance-Aufwand, dafür konsistent mit unserer jwt-Crate
- **Maintenance / license:** josekit MIT/Apache, aktiv aber kleinerer Maintainer-Pool
- **Known gotchas / divergences:**
  - JWE algorithm-Coverage muss explizit deklariert sein (`A128KW`, `A256GCMKW`, `RSA-OAEP-256`, `ECDH-ES+A256KW`, …) — panva/jose deckt _alle_ RFC-Algos ab, das wollen wir nicht
  - Browser-/WebCrypto-Compat von panva/jose ist für unsere NAPI-Crate irrelevant (kein Browser-Target)
  - `createRemoteJWKSet` (HTTP-Fetching mit Cache) ist bewusst **nicht** im Scope — gehört in JS-Wrapper

## BACKLOG check

Kein Eintrag. Frischer Kandidat.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | JWE-Decrypt: 100 µs–2 ms (RSA-OAEP) bzw. 50–200 µs (AES-GCM mit pre-shared Key). JWK-Parse: 50–500 µs (RSA-Schlüssel-Validation) |
| Input size distribution | Token: 500 B–4 KB. JWK-JSON: 200 B–2 KB. Buffer-Lane oder String, beides OK bei diesen Größen |
| Output size distribution | Klartext-Payload (~100 B–4 KB), oder KeyLike-Handle |
| Reusable setup (stateful potential) | **Hoch.** Key-Parsing ist amortisierbar — `JoseKey` als NAPI-Class mit `.decrypt(token)` / `.sign(payload)` Methoden. Das ist der Hauptlevergewinn |
| Batch-usage realism | Niedrig — Auth-Calls sind per-Request, nicht batchbar. Stateful-Class ersetzt Batch |
| FFI-share estimate vs. Rust work | Per `decrypt`-Call: ~109 ns Floor + ~500 ns Token-String-Crossing = ~700 ns FFI vs. ~100–500 µs Crypto-Work = **< 0,7 %** |

## Classification reasoning

Im Gegensatz zu scrypt/pbkdf2 hat `jose` **keinen Node-built-in-Konkurrenten**. Node hat low-level `crypto.createSign`/`crypto.createCipheriv`, aber kein JWE-/JWK-Highlevel-API. Wer JWE will, installiert ein npm-Paket — und panva/jose ist der De-facto-Standard.

Speedup-Erwartung gegen panva/jose (pure JS, V8-optimiert aber Crypto-Operationen sind nicht V8-tunable):
- JWE-Decrypt RSA-OAEP: 3–5× (RSA-Math in Rust ist deutlich schneller als pure-JS BigInt)
- JWE-Decrypt AES-GCM mit pre-shared Key: 2–3× (AES-NI über RustCrypto)
- JWK-Parse: 2–4×

**Stateful-API ist der entscheidende Hebel:** Eine JS-User schreibt heute `await jwtDecrypt(token, key, options)` und parst den Key implizit pro Call. Wir bieten:

```ts
const key = new JoseKey({ jwk })  // einmal beim Startup
const payload = key.decrypt(token)  // hot path, 0 Setup
```

Das ist die argon2-`hash`-vs-`verify`-Pattern angewandt auf JWE.

**Risiko Yellow → Green:** Wenn wir versuchen, _alle_ JWE-Algos zu unterstützen, blowt der Binary auf. Strict-Scope auf die 4 häufigsten Algos (RSA-OAEP, RSA-OAEP-256, A256GCMKW, ECDH-ES+A256KW) hält Bundle bei ~1,5 MB.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/jose` (Drop-in für JWE/JWK-Subset von panva/jose) — **ergänzt** `@amigo-labs/jwt`, ersetzt es nicht
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
  - JWE-Decrypt RSA-OAEP-256, 2048-bit Key, Payload 200 B (Auth-Middleware-Median)
  - JWE-Decrypt A256GCMKW, Payload 200 B (HOT-PATH-Median)
  - JWE-Encrypt ECDH-ES+A256KW, Payload 1 KB (Token-Issuance)
  - JWK-Parse RSA-2048 Public Key (Startup)
  - **Stateful** vs. **Stateless** Variante zum Demonstrieren des Class-API-Hebels
  - Baseline: panva/jose neueste Version

- **Acceptance thresholds (Green gate):**
  - ≥2× Stateful-Decrypt vs. panva/jose bei Median-Payload
  - ≥3× JWK-Parse
  - ≥1× Stateless-Convenience-Layer (darf nicht langsamer sein, auch wenn Class-API der Pitch ist)
  - 100 % Test-Vector-Parität auf RFC-7516 (JWE) Standard-Vektoren

- **Risks:**
  1. **Scope-Creep:** `panva/jose` deckt 30+ Algorithmen ab. Wir machen 4. JS-User mit exotischen Algos (RSA1_5 — _legacy_, PBES2 — _legacy_, …) müssen bei panva/jose bleiben. Klar dokumentieren
  2. **Crate-Wahl josekit vs. RustCrypto-Komposition:** josekit ist convenient aber kleinerer Maintainer; RustCrypto-direkt ist konsistent zu unserer jwt-Crate aber 3× so viel Wrapper-Code. **Empfehlung: RustCrypto-Komposition** (jwt-Crate-Pattern wiederverwendbar)
  3. **JWKS-Remote-Caching:** `createRemoteJWKSet` aus panva/jose ist HTTP + In-Memory-Cache. Gehört nicht in NAPI — als JS-Wrapper-Layer im Crate-Package mitliefern oder explizit ausschließen
  4. **Bundle-Disziplin:** Bei Algo-Auswahl sparsam sein. Default-Features `aes-gcm`, `rsa`, `p256` reichen für 90 % der Real-World-Use-Cases

## If NO-GO — BACKLOG entry

N/A — GO empfohlen (scoped).

## Phase-B Messung (2026-04-19, linux-x64, Node v22.22.2)

v0.1 Scope ausgeliefert: `generateRsaKeyPair`, `generateEd25519KeyPair`, `jwkThumbprint`. JWE/JWS auf v0.2 verschoben.

| Funktion | @amigo-labs/jose | jose (panva, pure JS) | Speedup |
|---|---:|---:|---|
| jwkThumbprint Ed25519 | 507 407 hz | 271 279 hz | **1,87×** ✅ |
| jwkThumbprint RSA-2048 | 470 445 hz | 182 718 hz | **2,57×** ✅✅ |
| generateEd25519KeyPair | 52 939 hz | 7 312 hz | **7,24×** ✅✅✅ |
| generateRsaKeyPair (2048) | 6,92 hz | **18,08 hz** | **0,38× (2,6× langsamer)** 🔴 |

**Ergebnis: 3/4 Green, 1/4 Red.**

**Warum RSA-Keygen verliert:**
panva/jose nutzt unter der Haube `crypto.subtle.generateKey` (WebCrypto-API) — das ist Node-built-in OpenSSL-Code. **Genau die "Node-built-in dominates"-Falle, die scrypt/pbkdf2 zerlegt hat.** OpenSSL's RSA-Prime-Search (BIGNUM-Math, Miller-Rabin in C-ASM) ist signifikant schneller als pure-Rust `rsa = "0.9"`.

Diese Erkenntnis hätte ich aus den scrypt/pbkdf2-Reviews extrapolieren müssen — RSA-Keygen war unbeobachtet und hat den gleichen Konkurrenten.

**Was funktioniert weiterhin:**
- **Ed25519-Keygen 7,24× schneller** — panva/jose's WebCrypto-API für Ed25519 hat anscheinend höheren JS↔WebCrypto-Overhead, oder Node's Ed25519 ist suboptimaler implementiert. Klarer Sieg.
- **JWK-Thumbprint 1,87–2,57× schneller** — Hash-Computation (SHA-256) + JSON-Canonicalization in Rust schlägt panva/jose's pure-JS String-Concatenation
- 3 von 4 Funktionen liefern Wert

**Phase-C/D-Plan:**
- **C.6 Algorithm:** `generateRsaKeyPair` ist nicht algorithmisch optimierbar (RSA-Math ist bekannt). Pure-Rust hat strukturellen Nachteil gegen OpenSSL.
- **Realistische Option:** README + API-Doc explizit empfehlen, für RSA-Keygen Node-built-in `crypto.generateKeyPair('rsa', {modulusLength: 2048})` zu nutzen, dann nur die JWK-Konvertierung mit unserer Crate. Liefert beste-of-both-worlds.
- **Drastische Option:** `generateRsaKeyPair` in v0.2 deprecaten / aus Public-API entfernen, Crate auf "JWK-Tooling + Ed25519" fokussieren.

**Empfehlung für v0.1:** Behalten, README-Warning für RSA-Keygen. v0.2-Roadmap erweitert um JWE-Decrypt (echter Lückenfüller) statt RSA-Keygen-Optimierung.
