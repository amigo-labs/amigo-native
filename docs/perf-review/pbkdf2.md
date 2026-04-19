# Candidate review: `pbkdf2`

> **Status:** NO-GO · **Predicted:** 🔴 Red (Adoption-bedingt) · **Reviewed:** 2026-04-19

## Verdict

Gleiches Problem wie scrypt, nur schärfer: **Node hat `crypto.pbkdf2` built-in als native C++-Implementierung** (sync + async, alle gängigen Hash-Algos). Die ~30 M weekly downloads des npm-Pakets `pbkdf2` sind **dominant Browser-/Bundler-Ökosystem** (`crypto-browserify`-Shim, Webpack/Browserify polyfills) — Server-Code in 2026 nutzt `crypto.pbkdf2` direkt. Unsere NAPI-Crate erreicht diese Bundler-User nicht (kein Browser-Target) und bietet Server-Usern keinen Grund, Node's built-in zu ersetzen. Speedup vs. Node-built-in vermutlich < 1,4×, gleicher Code-Path im Hintergrund (beide rufen OpenSSL-/RustCrypto-Implementierungen auf).

## JS package

- **npm:** `pbkdf2` (~30 M weekly) — pure JS Implementierung, primär als browserify-shim
- **Downloads:** 30 M weekly, aber **Adoption-Quality niedrig** — fast ausschließlich transitive dep
- **Exports / API surface:** `pbkdf2(password, salt, iterations, keyLen, digest, cb)`, `pbkdf2Sync(...)`
- **Typical input:** Passwort + Salt; Iterations 100 000–600 000 (OWASP-2023-Empfehlung)
- **Typical output:** Key-Bytes (typisch 32 Bytes für SHA-256-HMAC)
- **Realistic median use-case:** Server Node: `crypto.pbkdf2` (built-in). Browser/Edge: `pbkdf2` npm (pure JS). Unsere Crate trifft nur den Server-Markt, also Konkurrenz = Node-built-in

## Rust replacement

- **Candidate crate(s):** `pbkdf2` (RustCrypto)
- **Maintenance / license:** RustCrypto, gut gepflegt, MIT/Apache
- **Known gotchas / divergences:** Hash-Algo-Selection (SHA1/256/384/512) muss explizit Parität mit Node-Strings haben (`'sha256'` etc.)

## BACKLOG check

Kein Eintrag.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 1–50 ms bei 100k–600k Iter — FFI-Floor irrelevant |
| Input size distribution | Klein (< 128 Bytes) |
| Output size distribution | 32 Bytes |
| Reusable setup (stateful potential) | Keine. HMAC-Key wird pro Call gesetzt |
| Batch-usage realism | N/A |
| FFI-share estimate vs. Rust work | < 0,01 % |

**Wieder kein FFI-Problem.** Reines Adoption-/Konkurrenz-Problem.

## Classification reasoning

Beide harten Regeln greifen:

1. **"Realistic median use-case":** Server-Node-Code nutzt `crypto.pbkdf2`. Punkt. Wer noch `pbkdf2`-npm direkt verwendet, ist entweder Browser-Bundle (für uns unerreichbar) oder Legacy-Code.

2. **"No sunk-cost":** Selbst wenn wir 1,4× vs Node built-in messen würden — der Switching-Cost (`crypto.pbkdf2` → `@amigo-labs/pbkdf2`) ist für die meisten Codebases den Marginal-Gain nicht wert. Argon2 hat keinen built-in-Konkurrenten, das macht den Unterschied.

Klassifikation **Red** statt Yellow weil:
- Adoption-Pfad nicht plausibel
- 1,4×-Marginal-Gain wäre Argon2-Pattern, aber bei Argon2 gibt's keinen built-in als Default-Wahl
- Unsere Bundle-Größe (~1 MB Binary + 6 Platform-Stubs) vs. Node-built-in (0 Bytes Install) ist ein No-Brainer

## If GO — proposed port

**Nicht empfohlen.** Falls jemand zwingend will:
- Pitch nur als "explizit getestete Cross-Plattform-Konsistenz" (Node-built-in nutzt OpenSSL-Variante des OS, RustCrypto ist deterministisch)
- Bench-Gate: ≥1,8× vs. `crypto.pbkdf2` bei 100k Iter — sonst raus

## If NO-GO — BACKLOG entry

```markdown
- **pbkdf2** (~30M weekly). Node hat `crypto.pbkdf2` built-in als native OpenSSL-Implementierung (sync + async, alle Hash-Algos). 30M-Downloads-Zahl ist dominant Browser-Bundler-Shim (`crypto-browserify`), nicht reale Server-Adoption. Unsere NAPI-Crate erreicht weder Browser-User noch bietet Server-Usern Grund, Node-built-in zu ersetzen. Strukturell schwerer Pitch als scrypt (gleiche Logik aber pbkdf2-Server-Adoption ist noch klarer Built-in-dominiert).
```

Section in `BACKLOG.md`: **FFI overhead > gain** (Variante: "Node-built-in dominiert; npm-Downloads sind Bundler-Shim")
