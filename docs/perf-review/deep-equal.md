# Perf-Review: `@amigo-labs/deep-equal`

> **Status:** 🔴 Red (bestätigt) · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (deprecated)

## Verdict

Re-Review bestätigt die Deprecation-Entscheidung aus 0.2.0: es gibt strukturell keinen Hebel, `fast-deep-equal` mit einem NAPI-Binding zu schlagen — die Phase-C-Liste ist vollständig nicht-anwendbar.

## Classification rationale

Drei Dinge machen den Fall eindeutig:

1. **Die publizierte "1,3× faster"-Zahl stammt gar nicht vom Rust-Code.** `wrapper.js` exportiert per Default eine pure-JS-`equal`-Funktion (Zeilen 9–61) — `native.deepEqualJson` ist nur ein Opt-in-Export für Plain-JSON-Inputs und taucht im Default-Pfad nicht auf. Die Benches in `__bench__/index.bench.ts` importieren den Default-Export, messen also V8 gegen V8. Der Rust-Crate ist im gemessenen Hot-Path schlicht nicht beteiligt.

2. **Die FFI-Baseline schließt jede Rust-Route strukturell aus.** `BASELINE.md` zeigt: jeder NAPI-Call kostet mindestens 109 ns (Floor), `serde_json::Value`-Marshalling eines Objekts mit N Properties zahlt zusätzlich das `Vec<T>`-Element-Porto von ~43 ns pro Property. Ein 7-Key-Objekt landet damit *vor* dem ersten Vergleich bei ≥400 ns — `fast-deep-equal` ist für denselben Input mit ~680 ns insgesamt durch. Es gibt keinen Vergleichs-Algorithmus, der den FFI-Teil kompensiert.

3. **Der Alternative ist V8-JIT-Code.** `fast-deep-equal` ist ~32 Zeilen monomorphes JS, das V8 inline-cached und in eine Handvoll Maschinen-Instruktionen übersetzt. Rekursiver Property-Walk ist genau der Workload, den V8 seit einem Jahrzehnt optimiert. Kein Rust-Port mit `napi::JsObject::get_named_property` (ein FFI-Hop pro Property) kommt dagegen an.

## Evidence

### Measured speedup (from docs/data.json)

| Szenario | `@amigo-labs/deep-equal` (JS-Wrapper) | `fast-deep-equal` | Ratio |
|---|---:|---:|---:|
| flat 7-key objects | 1.909.263 ops/s | 1.468.804 ops/s | 1,30× |
| deeply nested (20 levels) | 334.890 ops/s | 316.431 ops/s | 1,06× |
| 10k objects in array | 240 ops/s | 236 ops/s | 1,02× |

Zur Einordnung: das sind **JS vs. JS**-Zahlen, nicht Rust vs. JS. Native wird in `amigoEqual(a, b)` nie aufgerufen.

### Realistic use-case

Deep-equal-Aufrufe in der Praxis sind kurz und häufig: React-Memo-Vergleiche, Redux-Selector-Caches, Jest-Matcher, Request-Diffs. Median ~5–50 Properties, Call-Frequenz hoch, keine Amortisation einer Setup-Phase. Das ist exakt die "tiny work per call, many calls"-FFI-Falle aus den Post-Mortems (mime, dotenv, shallow-clone).

### Benchmark gaps

Keine für die Deprecation-Entscheidung relevanten — die drei gemessenen Size-Buckets decken die realistischen Fälle ab, und alle drei sind ≤1,3× oder Parität. Eine zusätzliche Messung des tatsächlichen `native.deepEqualJson`-Pfades gegen `fast-deep-equal` würde die Lücke noch deutlicher zeigen, ist aber nicht nötig — die FFI-Baseline gibt die Antwort bereits vorab.

### API surface

`deep_equal_json(a: Value, b: Value) -> bool` in `src/lib.rs:39`. Zwei `serde_json::Value`-Inputs (owned), Bool-Output. Signatur ist *schon* so schlank wie sie an NAPI gehen kann — weiteres Input-Trimming ist nicht möglich, ohne die Semantik zu verlieren.

### Bundle / binary size

Nicht der Bottleneck. `wrapper.js` lädt den nativen Binary lazy, aber der komplette Payload inkl. prebuilds ist größer als `fast-deep-equal`s 32-Zeilen-Source. Im "Rust verliert schon am Floor"-Szenario ist das nur ein weiterer Nachteil, nicht der Hauptgrund.

### FFI-overhead baseline

`BASELINE.md`:
- Floor: 109 ns/Call.
- `sumArray(Vec<u32>)` (nächstbester Proxy für Property-Marshalling): 43 ns pro Element.
- `echoBuffer` bleibt bei ~180 ns auch für 10 MB — **aber** deep-equal hat keinen Buffer-Input-Pfad, weil Object-Identity nicht aus Bytes rekonstruierbar ist (Referenz-Zyklen, Shared-Refs, NaN-Semantik, Typed-Arrays, Map/Set).

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | ❌ nicht anwendbar | `Value` ist bereits der schlankste JSON-Input-Typ. Buffer-Overload würde bedeuten, JS müsste vor dem Call canonical-serialisieren — das kostet allein schon mehr als fast-deep-equal komplett. |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | ❌ nicht anwendbar | Output ist `bool`, nicht optimierbar. |
| C.3 | Batch API | ❌ nicht anwendbar | Real-World-Callers rufen eine Pair pro Memo-/Selector-Tick. `deepEqualMany(pairs)` würde nur die (fehlenden) Callsites für einen synthetischen Gewinn bauen. |
| C.4 | Stateful API (reusable setup via NAPI class) | ❌ nicht anwendbar | Es gibt keinen wiederverwendbaren Setup-Schritt zwischen zwei ad-hoc-Values. Eine "Canonicalize-Once, Compare-Many"-API wäre ein anderes Produkt (Hashing/Fingerprint) und löst das semantische Problem nicht — NaN, RegExp, Map/Set sind nicht kanonisierbar. |
| C.5 | Parallelization (rayon über große Inputs) | ❌ nicht anwendbar | Der 10k-Array-Bench zeigt: beide Implementierungen sind bei ~240 ops/s. Bottleneck ist **Marshalling**, nicht Compare. Rayon parallelisiert den Compare — die Marshalling-Phase läuft davor und seriell. Null Gewinn. |
| C.6 | Algorithm swap (SIMD / Streaming / schnellerer Crate) | ❌ nicht anwendbar | Der Algorithmus ist schon trivial-optimal (O(n), ein Pass, Early-Exit bei Mismatch). Es gibt keine schnellere strukturelle Gleichheit — V8 JIT-Code schlägt generierte Rust-Compares auf dem Objektgraph, weil er die Indirection über NAPI nicht hat. |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | ❌ nicht anwendbar | `serde_json::Value` allokiert selbst nicht hot-path-relevant — die Kosten sitzen im NAPI-Bridge-Code, der außerhalb unserer Kontrolle liegt. |
| C.8 | Bundle-size (LTO, features, panic=abort, strip) | ❌ nicht anwendbar | Der Workspace hat diese Flags bereits gesetzt. Und Bundle-Size ist hier nicht der Grund für das Red. |

**Null aus acht** — das ist das Signal. Wenn die komplette Hebel-Liste nicht-anwendbar ist, ist nicht die Implementierung das Problem, sondern die Passform des Packages.

## Action plan

**Plan: Deprecation weiterführen, nicht revidieren.**

1. **Keine Optimization-Sprint-Investition.** Die Phase-C-Analyse bestätigt: es gibt keinen realistischen Hebel. Jede investierte Stunde landet in dem einen Fenster, das der FFI-Floor ohnehin schließt.
2. **Deprecation-Schedule unverändert lassen:**
   - 0.2.0 (shipped): `deprecated`-Field in `package.json`, README-Warning, `MIGRATION.md` verweist auf `fast-deep-equal` und `fast-deep-equal/es6`. ✅ erledigt.
   - Fenster bis ~2026-07 offenhalten, damit Caller migrieren können.
   - Danach: Move nach `archived/deep-equal/`, CI skippt den Crate.
3. **`docs/packages.json`-Einträge ziehen.** Die "up to 1,3× faster"-Zahl ist irreführend — sie gehört zum JS-Wrapper, nicht zum Rust-Crate. Empfehlung: beim Archive-Move den Eintrag aus der Registry entfernen, damit er nicht in die Marketing-Sektion der Landing-Page rutscht. (Skill schreibt das hier nur auf — Edit liegt beim User.)
4. **Post-Mortem als Lerneintrag lassen.** `docs/post-mortems/deep-equal.md` ist gut und wird als negatives Referenzmuster ("FFI-Trap-Shape: tiny-work-per-call, property-walking APIs") für künftige Candidate-Reviews weiter zitiert.

**Was wir nicht tun sollten:** den Crate nochmal öffnen, um `deepEqualJson` einen anderen Algorithmus zu verpassen. Die Frage ist beantwortet — nicht der Algorithmus ist zu langsam, die Aufrufform ist falsch.

## References

- Crate: `crates/deep-equal`
- Bench: `crates/deep-equal/__bench__/index.bench.ts`
- Lib: `crates/deep-equal/src/lib.rs`
- Cargo: `crates/deep-equal/Cargo.toml`
- Wrapper: `crates/deep-equal/wrapper.js` (Default-Export = pure JS!)
- Post-Mortem: `docs/post-mortems/deep-equal.md`
- FFI-Baseline: `docs/BASELINE.md`
- `docs/packages.json` speedup field: `"up to 1.3× faster"` (Achtung: misst den JS-Wrapper, nicht den Rust-Crate)
