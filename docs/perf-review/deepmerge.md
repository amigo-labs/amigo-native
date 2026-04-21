# Perf-Review: `@amigo-labs/deepmerge`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**3,38×–5,55× vs. `deepmerge` npm** über alle drei Szenarien (flat / deep / large-arrays). Das ist eines der überraschenderen Green-Verdikte im Portfolio — deepmerge wirkt oberflächlich wie ein `deep-equal`-Antipattern (zwei JS-Objekte rein, ein JS-Objekt raus), aber die Object-Traversal + Allokations-Arbeit ist in Rust signifikant schneller als V8's Object-Prototype-Walking, selbst mit FFI-Overhead durch `serde_json::Value`-Marshalling.

## Classification rationale

1. **Object-Allokation ist der eigentliche Bottleneck in JS.** V8 alloziert jede `{...}`-Spread-Kopie als neuen Shape-Descriptor. Tief geschachtelte Objects triggern Hidden-Class-Transitions pro Ebene. Rust `serde_json::Map` ist ein flat HashMap-backed-Structure — Insert-Kosten sind konstant.
2. **Array-Concat-Skalierung** (1000-item) ist der größte Win (4,91×). deepmerge-npm ruft `Array.prototype.concat` in einer Schleife über die Keys = wiederholte Array-Allokation.
3. **FFI-Transport ist der Kosten-Punkt, aber amortisiert.** Wir marshallen zwei JS-Objects über `serde_json::Value` rein und einen raus. Das ist `Vec<Object>`-ähnlicher FFI-Cost (siehe `docs/post-mortems/xml.md`), aber einmal pro Call — die Rust-Merge-Arbeit dominiert.
4. **Prototype-Pollution-Protection als Nebenprodukt.** Rust-seitige `__proto__`/`constructor`/`prototype`-Filterung ist security-relevant und in der deepmerge-npm-Version ein wiederkehrender CVE-Target.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/deepmerge | deepmerge npm | Speedup |
|---|---:|---:|---:|
| flat 4-key objects | 3 353 331 Hz | 992 663 Hz | **3,38×** |
| deep (10 levels) | 210 618 Hz | 37 983 Hz | **5,55×** |
| 1000-item arrays | 3 564 Hz | 725 Hz | **4,91×** |

### Realistic use-case

**Config-Merging** — CLI-Defaults + User-Config + Project-Config + Env-Overrides. Typische Object-Größe: 5–50 Keys, 2–5 Levels tief. Mehrfach pro Process-Start gerufen. Zweiter Use-Case: **Deep-Clone via `merge(target={}, source)`** — Idiom in Vue/React-State-Management und Vanilla-JS.

### Benchmark gaps

- **`mergeAll`-Pfad** (Variadic-Merge) nicht gebenched. API exponiert `merge_all_json(values: Vec<Value>)` aber kein Bench-Slot.
- **Extreme-deep (50+ Levels) nicht getestet.** Meist künstlich, aber testbar für Stack-Depth.
- **Rich-Type-Handling** (Date, RegExp via JS-Wrapper) nicht in Perf-Bench (ist `__conformance__`-Thema).

### API surface

```rust
#[napi] fn merge_json(target: Value, source: Value, options: Option<DeepmergeOptions>) -> Value
#[napi] fn merge_all_json(values: Vec<Value>, options: Option<DeepmergeOptions>) -> Value
```

- `Value` = `serde_json::Value` — Objects/Arrays/Primitives. Rich-Types (Date, RegExp, Map, Set) werden in JS-Wrapper-Layer abgefangen (README dokumentiert).
- `DeepmergeOptions.array_merge`: `'concat'` (default) oder `'overwrite'`.
- Prototype-Pollution-Filter hart eingebaut: `FORBIDDEN = ["__proto__", "constructor", "prototype"]` werden beim Merge ignoriert.

### Bundle / binary size

`serde_json` ist die einzige nennenswerte Dep. ~400–600 KB pro Target.

### FFI-overhead baseline

- Flat 4-key-Objekt: 2× Input-Marshalling + 1× Output ≈ 1–3 µs bei 100-Byte-Objekten. Auf 300 ns Rust-Merge-Work = ~5×. Aber JS-Äquivalent (deepmerge-npm) braucht selbst ~1 µs für dieselben Objekte. Netto: 3,38× Win.
- Deep 10-Level: Input ~2 KB JSON + Output ~2 KB. FFI ~10 µs auf ~5 ms Rust-Work = 0,2 %. Dominant Rust.
- 1000-Array: Input 2× 8 KB, Output 16 KB. FFI ~50 µs auf 300 µs Rust. ~17 %. Grenzwertig, aber 4,91× Margin hält.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (Buffer statt Value?) | ❌ not applicable | User-API ist JS-Object nativ; Buffer-Overload würde bedeuten JSON-stringify auf Caller-Seite, das verlagert die Arbeit |
| C.2 | Output-type minimization | ❌ not applicable | — |
| C.3 | Batch API (`merge_all_json`) | ✅ already done | Exponiert, nicht gebenched aber API da |
| C.4 | Stateful API | ❌ not applicable | — |
| C.5 | Parallelization | ❌ not applicable | Merge ist sequenziell |
| C.6 | Algorithm swap (simd-json statt serde_json) | 🟡 potential | `simd-json` für Input-Parse würde FFI-Share senken, aber Parse ist bereits V8-seitig (NAPI liefert `Value` fertig-deserialisiert). Nicht direkt anwendbar. |
| C.7 | Allocator tuning (bumpalo für Merge-Allocs) | 🟡 marginal | `serde_json::Map` nutzt BTreeMap-backed. Austausch gegen Bump-Arena würde Merge-Intermediates beschleunigen. Unbekannter Gewinn. |
| C.8 | Bundle-size | ✅ already done | Workspace-profile |

## Action plan

**Keep-as-is.** Green über alle Szenarien, keine offene Front.

Maintenance:

1. **`mergeAll`-Bench hinzufügen** — API exponiert aber nicht gemessen.
2. **Rich-Type-Wrapper-Test-Docs** (Date/RegExp in JS-Layer) dokumentieren — teilweise im README, aber Edge-Cases könnten ausgebaut werden.
3. **bumpalo-Spike als Fast-Follow** wenn Größen-Regressionen in späteren Node-Versionen auftreten.

## References

- Crate: `crates/deepmerge`
- Bench: `crates/deepmerge/__bench__/index.bench.ts`
- Lib: `crates/deepmerge/src/lib.rs`
- Cargo: `crates/deepmerge/Cargo.toml`
- `docs/packages.json` speedup: `"3.4–5.5× faster"`
