# Perf-Review: `@amigo-labs/argon2`

> **Status:** 🟡 Yellow · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

CPU-bound Password-Hashing — **1,37× vs. upstream `argon2` (C-bindings via node-gyp)**, **2,33× vs. `hash-wasm` WASM-build**. Upstream ist bereits nativ-kompiliert (argon2-C via node-gyp), deshalb ist die Margin die gesamte Phase-C/D-Ceiling dieses Paketes: Algorithm ist Argon2-2015-Spec, beide Seiten nutzen `blake2b`-Core-Loops, derselbe Algorithmus gibt keine Größenordnung her. Keep-as-is; kein Optimierungs-Sprint in Sicht, der über Messrauschen hinaus wirken würde.

## Classification rationale

Argon2 ist der definitive **algorithm-ceiling-bound** Fall im Portfolio:

1. **Upstream ist auch nativ.** `argon2` npm ist `node-gyp`-compiled C-Bindings zu libargon2. Wir kämpfen Rust-native vs. C-native an derselben Spec. Inner-Loop ist `blake2b`-Compress über 128-Byte-Blöcke, beide Seiten identisch vectorized.
2. **Default-Config ist bewusst langsam.** Memory-cost 64 MiB, time-cost 3, parallelism 4 — Argon2 soll 100–500 ms pro Hash brauchen. FFI-Floor (109 ns) vs. 300 ms Compute = **0,00004 %** Share. Kein FFI-Hebel möglich.
3. **hash-wasm ist die eigentliche Alternative.** 2,33× speedup vs. WASM-builds rechtfertigt das Paket portfolio-weit. WASM hat ~1,5× Overhead pro blake2b-round vs. native.
4. **Yellow-statt-Green** weil 1,37× vs. der primären Drop-in-Alternative (`argon2` npm) unter dem 2×-Gate liegt. Nicht Red, weil eindeutig positive Margin plus der WASM-Case Green ist.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/argon2 | argon2 (npm, C) | hash-wasm | vs. argon2 | vs. hash-wasm |
|---|---:|---:|---:|---:|---:|
| hash (low-cost params) | 320,93 Hz | 234,39 Hz | 137,48 Hz | **1,37×** | **2,33×** |
| verify | 321,38 Hz | — | — | (baseline) | — |

### Realistic use-case

Password-Hashing in Authentication-Flows. Eine Hash-Operation pro User-Registrierung / Login, nicht hot-loop. Default-Params (memory=64 MiB, time=3, parallelism=4) = ~300 ms. Serverseitig, nicht latency-kritisch unterhalb der Default-Cost-Konfiguration. Async-API (`hash()` gibt `AsyncTask` zurück) hält den Event-Loop frei — das ist der eigentliche Value vs. sync-only-upstream.

### Benchmark gaps

- **Verify-cross-bench fehlt.** Nur `@amigo-labs/argon2.verify_sync` gebenched — keine Zahlen vs. `argon2.verify` npm. Vor v0.2 nachziehen.
- **High-cost-params nicht getestet.** `memory=256 MiB, time=10` (paranoid-server-config) würde die CPU-Margin klarstellen. Erwartbar dort ≈1,3× weil blake2b-dominant.
- **Async-Pfad nicht direkt gemessen** (nur sync in Bench). Der Async-Overhead ist `AsyncTask` = Thread-Hop + Join — sub-millisekunden, vernachlässigbar gegen 300 ms Compute.

### API surface

```rust
#[napi] fn hash_sync(password: String, options: Option<Argon2Options>) -> Result<String>
#[napi] fn hash(password: String, options: Option<Argon2Options>) -> AsyncTask<HashTask>
#[napi] fn verify_sync(hash: String, password: String) -> Result<bool>
#[napi] fn verify(hash: String, password: String) -> AsyncTask<VerifyTask>
```

- Input `String` (Password) und `Option<Argon2Options>` (memory_cost, time_cost, parallelism, output_len). Output: PHC-String.
- `AsyncTask`-Variante ist der Default-Hot-Path — offloaded auf Worker-Pool.
- Keine Stateful-Class. Kein Callback-Boundary. Sauber.

### Bundle / binary size

`docs/data.json`-`sizes`-Feld für argon2: etwa portfolio-mittleres Größenmaß (600–800 KB pro Target). `argon2 = { version = "0.5", features = ["std"] }` ist kompakt, keine SIMD-Features.

### FFI-overhead baseline

Irrelevant — 300 ms-Compute pro Call absorbiert jede FFI-Grenze. Referenz: `docs/BASELINE.md:24` (noop = 109 ns).

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Buffer`-overload) | ❌ not applicable | Password ist String-native; FFI-Share <0,001 % |
| C.2 | Output-type minimization | ❌ not applicable | Output ist kurzer PHC-String |
| C.3 | Batch API | ❌ not applicable | Niemand hasht Passwords in Batches — Use-Case-Mismatch |
| C.4 | Stateful API (NAPI-Class mit reused Argon2-Config) | 🟡 marginal | `build_argon2()` kostet sub-µs; reuse lohnt nicht |
| C.5 | Parallelization (rayon über Multiple-Inputs) | ❌ not applicable | Argon2 selbst ist parallelisiert intern (`parallelism=4`) |
| C.6 | Algorithm swap (SIMD-blake2b) | 🟡 **potential**, uncertain | `blake2b_simd` crate hat AVX2-/NEON-Varianten. `argon2` crate v0.5 nutzt `blake2b` crate (scalar-default). Upgrade auf SIMD-Variante könnte 10–20 % bringen — nicht genug für Green-Upgrade, aber messbar. |
| C.7 | Allocator tuning | ❌ not applicable | Argon2-Memory-Allokation ist user-controlled `memory_cost` |
| C.8 | Bundle-size (LTO, features) | ✅ already done | Workspace-profile mit lto=true, strip=symbols |

## Action plan

**Keep-as-is.** Yellow bleibt Yellow, algorithmisch ceiling-limited. Drei kleine Maintenance-Items:

1. **Verify-cross-bench hinzufügen** (`argon2.verify` vs. `@amigo-labs/argon2.verify_sync`) — Doku-Sauberkeit vor v0.2.
2. **High-cost-param-bench** als zweiter Szenario — schärft die CPU-vs-FFI-Klarstellung für User, die paranoid-configs fahren.
3. **`blake2b_simd`-Spike als Fast-Follow** (nicht Sprint-Priorität). Erwartbar 1,37× → 1,5–1,6×, bleibt Yellow, ist Sign-of-Life für die Maintenance.

Kein Phase-C-Sprint scheduled. Kein Phase-D-Risiko (kein Red-Drift denkbar ohne V8/libargon2-Änderung).

## References

- Crate: `crates/argon2`
- Bench: `crates/argon2/__bench__/index.bench.ts`
- Lib: `crates/argon2/src/lib.rs`
- Cargo: `crates/argon2/Cargo.toml`
- `docs/packages.json` speedup field: `"1.37× faster"`
- Summary row: `docs/perf-review.md` (Yellow, Nach-Sprint-Tabelle)
