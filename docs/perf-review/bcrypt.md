# Candidate review: `bcrypt`

> **Status:** SHIPPED v0.1 · **Predicted:** 🟢 Green · **Measured:** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

`bcrypt` ist die nächstbeste Argon2-Geschwister-Crate: identische FFI-Mathematik (per-call ≥10 ms Hash-Compute, FFI-Floor unter 0,001 % der Arbeit), bewährter Rust-Crate (`bcrypt 0.18.0`, aktiv gepflegt), zwei reale Baselines mit klar gemessenen Schwächen (`bcrypt`-npm ist C++-via-node-gyp, `bcryptjs` ist pure-JS und 30 % langsamer). Erwarteter Gewinn ≥1,4× vs. `bcrypt`-npm (analog argon2 vs. argon2-npm) und ≥1,8× vs. `bcryptjs` — Green an allen realistischen Cost-Faktoren (4–14).

## JS package

- **npm:** `bcrypt` (3,5 M weekly), `bcryptjs` (6,5 M weekly) — kombiniert ~10 M weekly, Top-100-Bereich
- **Downloads:** 10 M weekly insgesamt; 8 021 npm-Pakete depend auf `bcrypt`
- **Exports / API surface:** `hash(pw, rounds, cb)`, `hashSync(pw, rounds)`, `compare(pw, hash, cb)`, `compareSync(pw, hash)`, `genSalt(rounds)`, `getRounds(hash)`
- **Typical input:** Passwort als String (UTF-8, ≤72 Bytes — alles darüber wird vom Algorithmus selbst trunkiert) + Cost-Factor (default 10–12)
- **Typical output:** Modular-Crypt-Format-String, ~60 Bytes ASCII (`$2b$12$...`)
- **Realistic median use-case:** **Web-App-Auth.** 1 Hash bei Signup, 1 Verify pro Login-Versuch. Cost-Factor 10–12 → 50–300 ms pro Call. Niemals gebatcht (jeder Call braucht unabhängiges Salt + ist absichtlich teuer)

## Rust replacement

- **Candidate crate(s):** `bcrypt 0.18.0` (RustCrypto-aligned, Vincent Prouillet)
- **Maintenance / license:** Aktiv gepflegt (Release vor 30 Tagen), MIT/Apache, MSRV 1.85
- **Known gotchas / divergences:**
  - 72-Byte-Trunkierung gilt in beiden Implementierungen — Parität trivial, aber explizit in Tests prüfen
  - Rust-Crate bietet zusätzlich `non_truncating_hash` / `non_truncating_verify` (returns `BcryptError::Truncation` ab >72 Bytes); für Parität exposed wir die trunkierende Variante als Default, könnten die strict-Variante als Opt-in anbieten
  - `DEFAULT_COST = 12` in Rust, `10` in `bcrypt`-npm — wir gehen mit `12` (modernerer Default), dokumentieren den Unterschied

## BACKLOG check

Kein Eintrag in `BACKLOG.md`. Frischer Kandidat.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **50–300 ms** bei Cost 10–12; **~1 ms** bei Cost 4 (Test-Minimum). Hash-Arbeit ist das Produkt — **absichtlich teuer** |
| Input size distribution | Passwort ≤72 Bytes UTF-8 (Algorithmus-Limit). String-Konvertierung ~100–200 ns, < 0,0001 % der Compute |
| Output size distribution | ~60 Bytes ASCII Hash-String. String-Konvertierung ~150 ns, irrelevant |
| Reusable setup (stateful potential) | Keine. Cost-Factor ist Argument, kein präkompilierter Zustand. (anders als z.B. `jwt` mit Key-Caching) |
| Batch-usage realism | **N/A**. Jeder Hash braucht unabhängiges Salt; Batching macht algorithmisch keinen Sinn. Nicht implementieren |
| FFI-share estimate vs. Rust work | **<0,001 %** bei Cost 10–12; **<0,02 %** bei Cost 4. Strukturell unsichtbar |

## Classification reasoning

`bcrypt` ist das Lehrbuchbeispiel der Green-Shape: bytes-in / bytes-out (kurze Strings beidseitig), substantielle CPU-Arbeit pro Call, keine FFI-Hot-Loops. Es matcht 1:1 das Profil von `argon2` — und argon2 ist im Repo gemessen mit:

- 1,43× schneller als `argon2` npm (C++-via-node-gyp)
- 2,45× schneller als `hash-wasm` (WASM)

(Quelle: `docs/data.json`, `argon2 - hash (low-cost)`)

Der 1,43×-Gewinn vs. C++-Bindings ist allein durch sauberere napi-rs-FFI begründet (kein Vec/Array-Marshalling, kein doppeltes Parsen der Optionen). Genau dieselbe Dynamik gilt für `bcrypt` vs. `bcrypt`-npm — gleiches node-gyp-Problem (langsamer Build, fragilere Plattform-Bindings, ältere NAN-API).

Vergleichspunkte aus Post-Mortems:
- **Nicht** wie `deep-equal`/`mime`: kein Per-Property-FFI-Hop, keine ns-skalige JS-Arbeit
- **Nicht** wie `levenshtein`: kein V8-JIT-konkurrenzfähiges DP-Muster (Blowfish-Schedule ist Bit-Twiddling, kein Schleifen-Hot-Path den V8 inlinen kann)
- **Wie** `argon2`/`jwt`: krypto-schwere Compute, einmaliger Call pro User-Aktion, Bytes-rein/Bytes-raus

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/bcrypt`
- **Primary API sketch:**
  ```ts
  export interface BcryptOptions {
    cost?: number  // 4–31, default 12
  }

  export declare function hash(password: string, options?: BcryptOptions | null): Promise<string>
  export declare function hashSync(password: string, options?: BcryptOptions | null): string
  export declare function verify(hash: string, password: string): Promise<boolean>
  export declare function verifySync(hash: string, password: string): boolean
  ```
  → **Bewusst identisch zu `crates/argon2/index.d.ts`.** Erlaubt direkte Adaption des argon2-Source-Layouts und des Konformitäts-Test-Setups.

- **Must-have benchmark scenarios:**
  - `hash` bei Cost 4 (Smallest realistic — Test-Suites)
  - `hash` bei Cost 10 (Industry-Standard)
  - `hash` bei Cost 12 (`bcrypt`-Rust-Crate-Default, auch unser Default)
  - `verify` bei Cost 10 (häufigster Real-World-Call: Login)
  - **Beide JS-Baselines pflichtig:** `bcrypt` (npm, C++) **und** `bcryptjs` (pure JS) — verschiedene User-Segmente

- **Acceptance thresholds (Green gate):**
  - ≥1,4× vs. `bcrypt` npm bei Cost 10 (Spiegel argon2-Resultat)
  - ≥1,8× vs. `bcryptjs` bei Cost 10
  - ≥1,0× vs. beiden bei Cost 4 (Floor-Check)
  - 100 % Parity bei 72-Byte-Trunkierung, Cost-Range 4–31, Hash-Format `$2a$`/`$2b$`/`$2y$`

- **Risks:**
  1. **Adoption-Risiko bei `bcryptjs`-Usern:** Die wählen pure-JS bewusst (Edge-Runtime, Bundle-Size, kein node-gyp). Native Crate erreicht primär die `bcrypt`-npm-User. Akzeptabel — `bcrypt`-npm allein hat 3,5 M weekly.
  2. **Cost-Factor-Default-Diskrepanz:** `bcrypt`-npm default ist 10, Rust-Crate default ist 12. Wir nehmen 12 als modernere Empfehlung, dokumentieren den Wechsel im README.
  3. **Bundle-Size:** ~1 MB Binary (argon2 ist Referenz) vs. 9 KB für bcryptjs. Akzeptabel im Vergleich zu `bcrypt`-npm's 324 KB + node-gyp-Build-Footprint.
  4. **Algorithm-Variants:** `bcrypt`-npm akzeptiert `$2a$`, `$2b$`, `$2y$`. Rust-Crate verifiziert alle drei, hasht in `$2b$`. Parity-OK.

## If NO-GO — BACKLOG entry

N/A — GO empfohlen.

## Phase-B Messung (2026-04-19, linux-x64, Node v22.22.2)

Implementiert in `crates/bcrypt/`. Echte Bench-Resultate vs. argon2-Pattern-Vorhersage:

| Szenario | @amigo-labs/bcrypt | bcrypt npm (C++) | bcryptjs (pure JS) | Speedup |
|---|---:|---:|---:|---|
| hash cost 4 | **848,75 hz** | 748,70 hz | 696,96 hz | 1,13× / 1,22× ✅ |
| hash cost 10 | 14,64 hz | **16,18 hz** | 12,99 hz | **0,90×** / 1,13× ⚠️ |
| verify cost 10 | 14,71 hz | **16,23 hz** | 12,95 hz | **0,91×** / 1,14× ⚠️ |

**Ergebnis: 🟡 Yellow, nicht Green.** Vorhersage war falsch.

**Warum die argon2-Analogie nicht durchschlägt:**
- Argon2 vs argon2-npm: 1,43× schneller (gemessen) → wir haben das auf bcrypt extrapoliert
- Bcrypt vs bcrypt-npm: 0,90× — wir verlieren bei realistischer Cost (10)
- Hypothese: bcrypt-npm's C++-Implementierung (`bcrypt-pbkdf` C-Code mit hand-getuntem Blowfish-Schedule) ist signifikant schneller als RustCrypto's `blowfish`-Crate. Argon2 hat keinen so optimierten C-Konkurrenten — Rust gewinnt dort durch sauberere FFI; bei bcrypt ist der C-Code-Konkurrent algorithmisch kompetitiv

**Was wir trotzdem gewinnen:**
- vs. `bcryptjs` (6,5 M weekly, größere Userbase als bcrypt-npm) gewinnen wir an **allen** Cost-Stufen — 1,13–1,22× (klein bis Standard)
- Bei Cost 4 (Test-Use-Cases) auch vs. bcrypt-npm
- Cross-Platform-Prebuilds ohne node-gyp-Build-Dependency

**Optionen für Phase C / D:**
- **C.6 Algorithm-Swap:** `bcrypt`-Crate evaluieren mit alternativen Blowfish-Backends. `bcrypt = "0.18"` nutzt `blowfish 0.9` — vermutlich keine SIMD/ASM-Variante verfügbar
- **Yellow halten:** ehrlich positionieren als "bcryptjs-Ersatz mit native-Speed", nicht als bcrypt-npm-Killer
- **Re-Review in 6 Monaten** falls `blowfish`-Crate eine schnellere Variante kriegt

**Empfehlung:** Yellow halten, Phase-C nicht priorisieren. Die `bcryptjs` → @amigo-labs/bcrypt Migration ist ein klarer Win; bcrypt-npm-User haben weniger Grund zum Wechsel (außer Build-Friction). README muss diese Positionierung explizit machen.
