# Perf-Review: `@amigo-labs/nanoid`

> **Status:** 🟡 Yellow (perf-review.md label) / ~Parität-mit-Wins (measured) · **Reviewed:** 2026-04-21 · **Version:** 0.2.0

## Verdict

**Pure-JS seit 0.2.0** (Commit `794396b`) — der NAPI-Pfad wurde entfernt, weil der FFI-Floor (~1,5 µs pro Call im Rust-Original) größer war als der gesamte JS-Pfad zum Generieren einer 21-Char-ID (~260 ns in nanoid@5). Das ist die definitive Portfolio-Lehre zu Short-Work-Hot-Call-Shapes, dokumentiert in `docs/BASELINE.md:37–45`. **Aktuelle Messung:** Single-Call **0,95× vs nanoid@5** (leicht langsamer), Batch-1000 **1,14× vs nanoid@5** (schneller), CustomAlphabet **1,06× vs nanoid@5**, size=128 **1,07× vs nanoid@5**. Gegen `crypto.randomUUID`: Single-Call 1,05×, Batch 1,0×. Insgesamt ~Parität mit leichten situationsabhängigen Wins.

Die Paket-Daseinsberechtigung ist **nicht mehr primär Perf**, sondern: (a) Zero-Dependency-Maintenance-Zusage, (b) selbe API wie nanoid@5, (c) Batch-API mit gemessenen Wins für generate-many-Workloads, (d) Dokumentation der FFI-Lehre im Repo selbst.

## Classification rationale

nanoid ist der **gemessene Präzedenzfall** für "don't NAPI if per-call work is smaller than the NAPI floor":

1. **Rust-Version wurde gebaut und gemessen → Red.** Phase-B-Messung zeigte ~1500 ns pro NAPI-Call vs. ~260 ns pure-nanoid@5 = **0,17×**. Native Rust konnte nicht gewinnen weil Rust-Work < FFI-Floor.
2. **Pure-JS-Rewrite ist die Portfolio-Entscheidung.** `wrapper.js` nutzt `crypto.randomFillSync` + Pool-Amortisation über 128 IDs — identisch zu nanoid@5's Strategy.
3. **Yellow-Label wegen Single-Call-0,95×.** Gegen nanoid@5 im Einzel-Call leicht unter 1× (Messrauschen, aber konsistent). In der Klassifikations-Regel aus `docs/perf-review.md:14` ("nie langsamer als 1× auf realistischem Minimum") ist das Gate-Verfehlung → nicht Green.
4. **Batch-Win rechtfertigt Existenz.** Batch-1000 liefert 1,14× vs. nanoid@5-Loop — das ist ein **echter** Hebel für User die Massen-IDs generieren. Der Win kommt aus Pool-Pre-Allocation und Array-Construction-Efficiency.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/nanoid | nanoid@5 | crypto.randomUUID | vs. nanoid | vs. randomUUID |
|---|---:|---:|---:|---:|---:|
| single call (default size=21) | 3 937 989 Hz | 4 146 987 Hz | 3 737 946 Hz | **0,95×** | **1,05×** |
| batch 1000 × default | 5 511 Hz | 4 823 Hz | 5 521 Hz | **1,14×** | **1,00×** |
| customAlphabet (hex, 32 chars) | 3 189 255 Hz | 3 017 009 Hz | — | **1,06×** | — |
| single call size=128 | 988 439 Hz | 928 149 Hz | — | **1,07×** | — |

### Realistic use-case

**Primär-Case:** ID-Generierung in Datenmodell-Creation — 1–10 IDs pro User-Request, streamed over Request-Handler-Loop. **Sekundär:** Batch-Generation für Test-Fixtures, Seed-Data, URL-Tokens — 100–10 000 IDs in einem Pass.

Single-Call-Case ist der dominant User-Pfad (Datenbank-Insert-Time, Cookie-Set-Time, Request-ID-Assign-Time). Batch-Case ist Workload-spezifisch.

### Benchmark gaps

- **Extreme size (size=512+, URL-token-Case) nicht getestet.** Größere IDs brauchen mehr Pool-Refills — der Pool-Size-Multiplier=128 verschiebt sich ungünstig bei größeren IDs.
- **Rejection-Sampling-Path** (non-power-of-two Alphabet) nicht separat gebenched. Siehe `customRandom()` step-size-Heuristik — eigener Bench-Slot lohnt.
- **Parität mit nanoid@3 (CommonJS-only) nicht relevant** (wir matchen nanoid@5).

### API surface

```js
// wrapper.js exports
nanoid(size = 21)                        // → string
nanoidCustom(alphabet, size)             // → string
nanoidBatch(count, size)                 // → string[]
nanoidCustomBatch(alphabet, count, size) // → string[]
customAlphabet(alphabet, defaultSize)    // → (size?) => string (curried generator)
```

- Pure JS, keine NAPI-Grenze, keine Buffer-Marshalling.
- Pool-Strategie: 128 IDs worth of entropy pro `randomFillSync`-Syscall.
- Power-of-two-Alphabet: mask + index (no rejection sampling).
- Non-power-of-two: rejection sampling mit step-size-heuristic.
- `Array.from(alphabet)` für Unicode-grapheme-safe Custom-Alphabets.

### Bundle / binary size

**Kein Native-Binary.** Paket ist pure JS (~3 KB minifiziert). Keine `napi/`-Platform-Stubs nötig (war bei 0.1.x der Fall, in 0.2.0 entfernt).

Dies ist der einzige Crate im Portfolio, der **nicht** die 6-target-`npm/`-Konvention erfüllt — und der `audit-crates` skill flagt das explizit **nicht** als Drift, weil nanoid pure-JS ist per Design.

### FFI-overhead baseline

**Nicht anwendbar — kein FFI.** Die Messung aus Phase-B, die zum Rescope führte: NAPI-Rust-Path ~1500 ns pro Call, pure-JS ~260 ns. 5,8× langsamer durch NAPI allein. Das ist der dokumentierte `docs/BASELINE.md:37`-Fall.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ❌ not applicable | Kein FFI — alles pure JS |
| C.2 | Output-type minimization | ❌ not applicable | Output ist `string` in JS-Land, kein Marshalling |
| C.3 | Batch API | ✅ already done | `nanoidBatch` + `nanoidCustomBatch` shipping, 1,14× win measured |
| C.4 | Stateful API | ✅ already done | `customAlphabet(alphabet)` returniert curried generator — compile einmal, reuse viele |
| C.5 | Parallelization | ❌ not applicable | Workers wären overkill für 260 ns pro ID |
| C.6 | Algorithm swap | ❌ not applicable | `crypto.randomFillSync` ist die schnellste Node-Primitive für Entropy; pool-amortization ist Standard |
| C.7 | Allocator tuning | 🟡 marginal | Pool-size=128 könnte dynamisch adapten bei batch-heavy Workloads; sub-prozent-Gewinn |
| C.8 | Bundle-size | ✅ already done | Pure JS, ~3 KB, keine Dependencies |

## Action plan

**Keep-as-is.** Portfolio-Status ist korrekt: Yellow-mit-Green-Aspekten, Existenz-Berechtigung durch Zero-Dep + Batch-Win + FFI-Doku-Value. Kein Sprint.

Zwei kleine Follow-ups:

1. **Extreme-size-Bench** (size=512, Token-Use-Case) — aktuelle Lücke.
2. **Rejection-Sampling-Alphabet-Bench** als separater Slot — step-size-Heuristik-Tuning erst nach Messung.

Kein Phase-D-Risiko. Das Paket könnte theoretisch deprecated werden zugunsten direkter nanoid@5-Nutzung, aber die Argumente pro:
- Zero-transitive-Dep-Garantie
- Selbe API als Drop-in
- Batch-API mit messbarem Win
- Pädagogischer Wert als Portfolio-Referenz für "wann NAPI nicht gewinnt"

…rechtfertigen die Maintenance-Kosten auf absehbare Zeit.

## References

- Crate: `crates/nanoid`
- Bench: `crates/nanoid/__bench__/index.bench.ts`
- Lib: `crates/nanoid/wrapper.js` (pure JS)
- Types: `crates/nanoid/wrapper.d.ts`
- Migration: `crates/nanoid/MIGRATION.md` (0.1.x → 0.2.0 Rust-removal)
- Rescope commit: `794396b`
- `docs/packages.json` speedup field: `"up to 1.06× faster / 1.05× slower"`
- Summary row: `docs/perf-review.md` (Yellow, "Bereits pure-JS seit 794396b")
- FFI-baseline precedent: `docs/BASELINE.md:37` (noop = 109 ns; nanoid Phase-B = 1500 ns NAPI vs 260 ns JS)
