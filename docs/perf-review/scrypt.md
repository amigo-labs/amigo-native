# Candidate review: `scrypt`

> **Status:** NO-GO (vorerst) · **Predicted:** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

scrypt sieht oberflächlich aus wie ein argon2-Geschwister (memory-hard KDF, ms-skalige Compute, identisches API-Shape) — **aber Node hat seit v10.5 `crypto.scrypt` built-in als nativer C++-Code**. Die realistische Median-Konkurrenz im Server-Code ist nicht `scrypt-js`, sondern Node selbst. Erwarteter Speedup gegen Node-built-in: ~1,4× (analog argon2 vs argon2-npm), das **verfehlt den 2×-Green-Gate**. Adoption-Argument schwach: warum sollte ein Server-Dev unsere Crate installieren, wenn `crypto.scrypt` schon nativ da ist? Kein GO ohne Adoptionspfad.

## JS package

- **npm:** `scrypt` (deprecated, abandoned), `scrypt-js` (~3 M weekly, pure JS, Browser-fokussiert)
- **Downloads:** 3 M weekly (scrypt-js); Server-User nutzen `crypto.scrypt` (built-in seit Node 10.5)
- **Exports / API surface:** `scrypt(password, salt, N, r, p, dkLen)` → derived key bytes
- **Typical input:** Passwort + Salt (≤ 64 Bytes je); Parameter N=16384/32768, r=8, p=1
- **Typical output:** Key-Bytes (typisch 32–64 Bytes)
- **Realistic median use-case:** **Server-side**: `crypto.scrypt` (built-in C++). **Browser/Edge**: `scrypt-js` (pure JS). Unsere NAPI-Crate läuft nur im Node-Server, also ist die ehrliche Baseline `crypto.scrypt`

## Rust replacement

- **Candidate crate(s):** `scrypt` (RustCrypto, mature, MIT/Apache)
- **Maintenance / license:** RustCrypto-Familie, gut gepflegt
- **Known gotchas / divergences:** Parameter-Encoding-Konventionen variieren (N als log₂ vs. roh); MCF-Hash-Format `$scrypt$...` standardisiert über `scrypt-pw` Helfer

## BACKLOG check

Kein Eintrag. Aber sollte ggf. mit klarer Begründung dort landen.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 50–200 ms bei N=16384 — FFI-Floor irrelevant |
| Input size distribution | Klein (Passwort + Salt < 128 Bytes); String/Buffer-Konvertierung < 0,01 % |
| Output size distribution | 32–64 Bytes Key — irrelevant |
| Reusable setup (stateful potential) | Keine. Parameter pro Call |
| Batch-usage realism | N/A (jeder Call braucht unabh. Salt) |
| FFI-share estimate vs. Rust work | < 0,001 % bei Standard-Parametern |

**FFI ist nicht das Problem.** Der Algorithmus ist Rust-freundlich. Das Problem ist die **JS-Konkurrenz-Auswahl**.

## Classification reasoning

Die Anwendung von **Hard Rule 1** ("realistische Median-Use-Case") schlägt hier durch:

- vs. `scrypt-js` (pure JS): vermutlich 5–10× Speedup → Green
- vs. `crypto.scrypt` (Node built-in nativ): vermutlich ~1,4× Speedup (analog argon2-Pattern) → **Yellow** (verfehlt 2×-Gate)

Server-Code in 2026 nutzt fast immer `crypto.scrypt`. Die `scrypt-js`-Downloads sind dominant Browser-/Bundler-Ökosystem (browserify-shim, edge-runtime-Bibliotheken) — das ist **unsere Crate kann diese User strukturell nicht erreichen**, weil ein NAPI-Binary nicht im Browser läuft.

Im Gegensatz zu argon2/bcrypt: Node hat **keine** built-ins für die. Da ist unsere Crate die kanonische native Option.

## If GO — proposed port

**Nur sinnvoll falls:**
1. Bench gegen `crypto.scrypt` zeigt unerwartet ≥2× (z.B. weil Node's libuv-Async-Wrapper Overhead drauflegt) — **muss vor Port gemessen werden**
2. Oder: bewusster Pitch als "Sync-API ohne libuv-Roundtrip" für hot paths (Node's Sync-Variante existiert, aber blockt Event-Loop)

Sonst kein GO.

## If NO-GO — BACKLOG entry

```markdown
- **scrypt** / **scrypt-js** (~3M weekly). Node hat `crypto.scrypt` built-in als native C++-Implementierung. Realistic-median-Konkurrent ist Node-built-in, nicht scrypt-js. Erwarteter Speedup ~1,4× (siehe argon2-Pattern), verfehlt 2×-Green-Gate. scrypt-js-Downloads sind primär Browser/Bundler-Ökosystem — für unsere NAPI-Crate strukturell unerreichbar. Re-evaluate falls Bench gegen `crypto.scrypt` ≥2× zeigt.
```

Section in `BACKLOG.md`: **FFI overhead > gain** (Variante: "Node-built-in dominiert")
