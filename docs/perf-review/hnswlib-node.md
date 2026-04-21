# Candidate review: `hnswlib-node`

> **Status:** NO-GO (vorerst) · **Predicted:** 🟡 Yellow leaning 🔴 Red · **Reviewed:** 2026-04-21

## Verdict

`hnswlib-node` ist **selbst bereits ein natives C++-Binding** (node-addon-api wraps das Original-`hnswlib` von Yury Malkov). Ein NAPI-RS-Port würde Rust-`hnsw_rs` (oder `instant-distance`) gegen C++-`hnswlib` stellen — beides sind Implementierungen desselben HNSW-Algorithmus, beide native, beide compute-bound im gleichen Inner-Loop (SIMD-Distanz-Kernels + Heap-basierte Priority-Queue). Erwartbare Perf-Delta liegt bei **0,9×–1,4×** auf `searchKnn`, nicht ≥2×. Das ist die gleiche Lehre wie bei `onnxruntime-node` und `faiss-node` in `BACKLOG.md:36–37`: "re-wrapping a wrapper adds maintenance without speedup." Die FFI-Shape ist sauber (long-lived Index als NAPI-Class, ein Crossing pro Query), aber die Baseline ist falsch — wir messen nicht gegen JS, wir messen gegen natives C++. Der BACKLOG-"Predicted Green"-Eintrag überschätzt den Hebel.

## JS package

- **npm:** [`hnswlib-node`](https://www.npmjs.com/package/hnswlib-node)
- **Downloads:** ~50k/Woche (Q1 2026 estimate, BACKLOG-Zahl bestätigt)
- **Exports / API surface:** `HierarchicalNSW`-Class (stateful): `initIndex(maxElements)`, `addPoint(vec, label)`, `searchKnn(query, k, filter?) → {distances, neighbors}`, `readIndex(path)`, `writeIndex(path)`, `setEf(ef)`, `resizeIndex`, `markDelete`, `getCurrentCount`, `getMaxElements`
- **Typical input:** f32-Vektor der Embedding-Dimension 384 (MiniLM) / 768 (BERT) / 1536 (OpenAI-ada-002) / 3072 (text-embedding-3-large). Query ist **ein** Vektor, optional eine Filter-Funktion
- **Typical output:** `{distances: Float32Array, neighbors: Uint32Array}` der Länge k (typisch k=10–100)
- **Realistic median use-case:** RAG-Retrieval-Pfad. Index wird einmal geladen (10k–1M Vektoren), dann dauerhaft gehalten, pro Request 1–5 `searchKnn`-Calls. Queries pro Sekunde im Produktionspfad: 10–1000 je nach Service. Index-Build selten (Offline-Batch oder bei Doc-Update).

## Rust replacement

- **Candidate crate(s):**
  - [`hnsw_rs`](https://crates.io/crates/hnsw_rs) — pure-Rust HNSW, aktiv gepflegt (Jean-Pierre Both), MIT/Apache. Hat Serialize/Deserialize, Parallel-Insert via rayon. Feature-kompatibel mit Original-`hnswlib` im Standard-Fall.
  - [`instant-distance`](https://crates.io/crates/instant-distance) — alternative Rust-HNSW-Implementierung von Dirkjan Ochtman, kleiner, sauber, aber weniger Feature-Matrix (kein mark_delete in v0.6).
  - **Nicht geeignet:** `rust-hnsw` (unmaintained, 2021).
- **Maintenance / license:** Beide aktiv, MIT/Apache-2.0, Rust-only Deps. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Parität zur On-Disk-Format ist NICHT gegeben** — `hnswlib-node` schreibt das C++-`hnswlib`-Binary-Format. Weder `hnsw_rs` noch `instant-distance` lesen es. Ein Drop-in-`readIndex(path)`-Pfad kann **nicht** existierende `hnswlib`-Indexe laden. Das ist ein Migrations-Blocker für bestehende User.
  - Filter-Callbacks (`searchKnn(query, k, filter)`) sind in `hnswlib-node` pro-Element JS-Callbacks — diese über die FFI-Grenze zu schieben ist der `xml`/Object-Traversal-Antipattern (100k+ Callbacks pro Query). Müssten auf Bitmap-basierte Filter (`Uint8Array` der erlaubten Labels) umgestellt werden — das ist API-Bruch, nicht Drop-in.
  - Euclidean vs. Cosine vs. Inner-Product: `hnswlib-node` exponiert "l2"/"ip"/"cosine", `hnsw_rs` hat dieselben plus Custom-Distance-Traits. Parität machbar.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:10–11`:
> **hnswlib-node** (~50k). Approximate-nearest-neighbor search on f32 vectors via `hnsw_rs` / `instant-distance`. One call per query returns k results, index is long-lived state (NAPI class).

Einordnung als "Predicted Green". Dieses Review **widerspricht** dieser Vorhersage — siehe unten. Relevant für die Re-Kategorisierung ist die bestehende "Ruled out — AI-category"-Begründung in `BACKLOG.md:36–37`:
> onnxruntime-node (~400k), faiss-node (~10k). Already native bindings over C++ libraries — re-wrapping a wrapper adds maintenance without speedup.

`hnswlib-node` gehört strukturell in dieselbe Kategorie. Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantiell.** `searchKnn` auf 100k Vektoren × dim=384, ef=200, k=10 ≈ 50–500 µs in C++ `hnswlib`. `addPoint` ähnlich. FFI-Share vernachlässigbar (~109 ns auf 50 µs = 0,2 %). |
| Input size distribution | **Klein.** Query-Vektor als `Float32Array` ist 384×4 = 1,5 KB. Mit Buffer-Input flat <200 ns Transport (`docs/BASELINE.md:29`). |
| Output size distribution | **Klein.** k × (f32 distance + u32 label) = 10 × 8 B = 80 B. Wenn als `Buffer` zurückgegeben statt `Vec<BigInt>`: flat. |
| Reusable setup (stateful potential) | **Kritisch.** Index IS der State. NAPI-Class Pflicht. Load-einmal-query-oft ist das Lehrbuch-Muster. Hier gewinnt FFI-Shape. |
| Batch-usage realism | Mittel. `searchKnnBatch(queries: Buffer, k: number) → Buffer` könnte 100 Queries auf einmal feuern — Rust-seitig rayon-parallelisierbar. Das ist der einzige Hebel der gegen C++ gewinnen könnte (`hnswlib-node` hat keine Batch-API mit internem Thread-Pool). |
| FFI-share estimate vs. Rust work | <1 % bei vernünftiger API. Nicht das Problem. |

## Classification reasoning

Die FFI-Shape ist makellos — aber das ist nicht die binding constraint. Der Engpass ist **die Baseline**, gegen die wir messen:

1. **`hnswlib-node` ist kein JS-Konkurrent.** Es ist C++ `hnswlib` durchgeschliffen. Der innere Compute-Loop (SIMD-Distanz auf 384 f32s, Priority-Queue-Inserts) ist in C++ und Rust beide auto-vektorisiert von LLVM. Erwartbarer Speedup 0,9×–1,4×, in seltenen Fällen 1,8× wenn der C++-Code veraltet ist (z. B. kein AVX-512-Pfad). Das verfehlt das Green-Gate von ≥2× in `docs/perf-review.md:12–14` **strukturell**, nicht implementativ.

2. **`hnsw_rs` hat keinen bekannten SIMD-Vorsprung.** Ich finde in publizierten Benchmarks (`hnsw_rs` README, `instant-distance` README, ANN-Benchmarks-Repo) keinen Fall, in dem Rust-HNSW signifikant vor C++-`hnswlib` landet. Typisch 10–30 % innerhalb — Messrauschen-Zone.

3. **Der einzige echte Hebel wäre eine Batch-`searchKnnBatch`-API**, die rayon-parallel über Queries läuft. Das könnte 2–4× auf Multi-Core bringen. Aber das ist ein **neues API-Feature**, kein Drop-in, und `hnswlib-node`-User schreiben ihren Code gegen die Single-Query-API. Portfolio-Frage: wollen wir ein Paket bauen, dessen einziger Win eine API-Variante ist, die User nicht benutzen?

4. **DX-Argument allein reicht nicht.** `hnswlib-node` ist berüchtigt für node-gyp-Probleme (keine prebuilds für viele Node/Plattform-Kombinationen, v0.x-Serie unterstützt Node 22+ spät). NAPI-RS-Prebuilds wären ein echter DX-Win. Aber das Portfolio-Kriterium ist Perf (`docs/perf-review.md:12–22`), nicht DX. Wenn DX das Ziel ist, ist Fork+Prebuilds von `hnswlib-node` selbst günstiger als Neuport.

**Shape-Matching:**
- ❌ Nicht wie `jwt` / `inflate` (echte Rust-vs-pure-JS-Baseline)
- ❌ Wie `onnxruntime-node` / `faiss-node` (Rust-vs-C++-Native, keine FFI-Gewinnmarge)
- ⚠️ **Aber** FFI-Shape selbst ist sauber (NAPI-Class, long-lived), nur Baseline falsch

**Benchmark-Gap-Flag:** Diese Bewertung ist ohne Spike gemacht. **Falls** jemand einen 1-Tag-Spike mit `hnsw_rs` gegen `hnswlib-node` auf einem realistischen Corpus (100k Vektoren, dim=1536, k=10) laufen lässt und ≥2× misst, ist die NO-GO-Entscheidung zu revidieren. Der Spike wäre ein akzeptabler Weg, die Vorhersage zu falsifizieren — aber nur mit dokumentierter hnsw_rs-Config und hnswlib-node-Version.

## If GO — proposed port

Nicht empfohlen. Falls dennoch: siehe "Must-have benchmark scenarios" unten, die müssen **vor** dem Port bestanden werden.

- **Recommended crate-name:** `@amigo-labs/hnsw` (nicht `@amigo-labs/hnswlib-node` — nicht Drop-in wegen fehlender On-Disk-Format-Kompatibilität)
- **Primary API sketch:**
  ```ts
  export class HnswIndex {
    constructor(opts: {
      dim: number;
      maxElements: number;
      space: 'l2' | 'ip' | 'cosine';
      m?: number;        // default 16
      efConstruction?: number;  // default 200
    });
    addPoint(vec: Float32Array | Buffer, label: number): void;
    addPointsBatch(vecs: Buffer, labels: Uint32Array): void;  // primärer Hebel
    searchKnn(query: Float32Array | Buffer, k: number, ef?: number): { distances: Float32Array; neighbors: Uint32Array };
    searchKnnBatch(queries: Buffer, k: number, ef?: number): { distances: Buffer; neighbors: Buffer };  // primärer Hebel
    setEf(ef: number): void;
    getCurrentCount(): number;
    save(path: string): void;  // eigenes Format, nicht hnswlib-kompatibel
    static load(path: string): HnswIndex;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - Build: 100k × dim=1536 `addPointsBatch` — Ziel ≥2× vs. `hnswlib-node`-Loop
  - Query single: dim=1536, k=10, ef=200 — Ziel ≥1,5× vs. `hnswlib-node.searchKnn` (Yellow-Grenze)
  - Query batch: 100 queries × dim=1536, k=10 — Ziel ≥2× (Green-Grenze, rayon-Hebel)
  - Cold-load: `load(path)` auf 1M-Vector-Index — Ziel ≤ `hnswlib-node.readIndex`
- **Acceptance thresholds (Green gate):** ≥2× auf **mindestens zwei von drei Query-Szenarien** und ≥2× auf Build-Batch. Alles darunter: Nicht-Shippen.
- **Risks:**
  - On-Disk-Format-Inkompatibilität — Migrations-Pfad nötig
  - `hnsw_rs` Maintenance-Bus-Factor (ein primary author)
  - Filter-Callback-API-Bruch
  - Binary-Size (hnsw_rs ohne Deps ~2–4 MB pro Target, akzeptabel)

## If NO-GO — BACKLOG entry

```markdown
- **hnswlib-node** (~50k). Evaluated 2026-04-21 (`docs/perf-review/hnswlib-node.md`). `hnswlib-node` ist selbst natives C++-Binding; Rust-`hnsw_rs` gegen C++-`hnswlib` ist Rust-vs-Native, erwartbar 0,9–1,4×, verfehlt Green-Gate strukturell. Nur sinnvoll falls Spike auf 100k × dim=1536 ≥2× misst.
```

Section in `BACKLOG.md`: **Ruled out — AI-category (FFI-shape or structural)** — direkt neben `onnxruntime-node` und `faiss-node` eintragen. Der bestehende "Under investigation — AI / RAG preprocessing"-Eintrag (Zeile 10–11) sollte entfernt werden, da die Vorhersage "Predicted Green" nicht hält.
