# Candidate review: `compute-cosine-similarity` (and siblings)

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`compute-cosine-similarity` und die Geschwister-Pakete (`compute-dot-product`, `compute-euclidean-distance`, `compute-manhattan-distance`) haben den **archetypischen FFI-Drowns-SIMD-Shape**: zwei kleine-bis-mittelgroße f64-Arrays rein, eine f64 raus. Der Compute ist 10+ Jahren SIMD-fähig (AVX/NEON), ABER der FFI-Transport der Input-Arrays als `Float64Array` kostet für typische Embedding-Größen (dim=384–1536) mehr als die Distanz-Berechnung selbst. V8 hat die gleiche SIMD-Auto-Vectorization in TurboFan. Klassischer Black-Shape: kein Input-Size rettet das — noch größere Vektoren bleiben memory-bandwidth-bound und der JS-Loop hält mit dem Rust-Loop mit. Exakt die `deep-equal`-Lehre, nur auf Vektoren statt Objekten.

## JS package

- **npm:** [`compute-cosine-similarity`](https://www.npmjs.com/package/compute-cosine-similarity) + Geschwister (`compute-dot-product`, `compute-cosine-distance`, `compute-euclidean-distance`, `compute-manhattan-distance`, `compute-jaccard-distance`, etc.)
- **Downloads:** ~500k/Woche kombiniert für die Familie. Primäre Adoption durch ML/Embedding-Pipelines.
- **Exports / API surface:** `similarity(a, b) → number`. Keine State, keine Optionen. Minimal.
- **Typical input:** Zwei `Float64Array` (oder normale Arrays), typisch Länge 384 / 768 / 1536 (Embedding-Dimensions). Gelegentlich größer für Image-Features.
- **Typical output:** `number` (scalar f64, Range -1..1 für Cosine).
- **Realistic median use-case:** **RAG-Retrieval-Score** — ein Query-Embedding gegen hunderte bis tausende Doc-Embeddings, Top-K-Ergebnisse bestimmt durch Cosine-Score. Die Funktion wird in einer Hot-Loop gerufen (N Vergleiche pro Query). Zweiter Case: **Dedup-Check** in Embedding-Indexing (gegen alle bestehenden Embeddings clusters).

## Rust replacement

- **Candidate crate(s):** `ndarray` + `ndarray-rand` oder direkt `std::simd` (stable seit 1.72+). Für reine Cosine: `nalgebra` oder 10 Zeilen eigener Code mit `f64::mul_add`. Trivial, alle MIT/Apache, alles auto-vectorized.
- **Maintenance / license:** n/a — trivial
- **Known gotchas / divergences:** Normalization-Edge-Cases (Vector-of-Zeros → Division durch Null). Identisch zu JS-Lib.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "Two small arrays in, one float out — marshalling drowns SIMD. Same lesson as `deep-equal`." Review formalisiert mit Zahlen.

Abgrenzung:
- Gegen `docs/perf-review/deep-equal.md` (archived 🔴): identischer FFI-Floor-Trap. Two-Inputs-One-Scalar-Out ist die Gemeinsamkeit.
- Gegen `docs/perf-review/hnswlib-node.md` (NO-GO): hnswlib macht dasselbe (Cosine oder L2 auf Vektor-Paaren) aber **amortisiert über einen Index** — ein Query ruft N Distanzen intern in Rust, nicht N × FFI-Crossings. Genau deshalb ist Index-API sinnvoll, Per-Pair-API nicht.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial.** Cosine auf dim=1536: ~1 µs in JS (V8 mit SIMD), ~300–500 ns in Rust. Rust-Gewinn: ~500–700 ns pro Call. |
| Input size distribution | Zwei `Float64Array` × (384..1536) × 8 B = 3–12 KB × 2 pro Call. Als `TypedArray` Buffer-Handle: ~180 ns flat (BASELINE.md:30). Aber: für JS-Arrays (nicht TypedArray) ist Marshalling 43 ns/Element × 1536 × 2 = **132 µs** — katastrophal. Nur mit expliziten `Float64Array`-Inputs tolerabel. |
| Output size distribution | 1 × f64 → 8 B. Negligible. |
| Reusable setup (stateful potential) | Null. Stateless-Function. |
| Batch-usage realism | **Einziger möglicher Hebel:** `cosineBatch(query: Float64Array, corpus: Float64Array[], dim: number) → Float64Array` — ein Crossing pro N Paare. Das existiert aber als **NAPI-Class-API** bereits besser: `hnswlib`-style Index. Per-Pair-Package hat keinen Batch-Idiom. |
| FFI-share estimate vs. Rust work | Mit `Float64Array`: ~30–50 %. Mit normalem Array: >99 %. |

## Classification reasoning

`compute-*`-Familie ist Lehrbuch-Black:

1. **V8 vectorized TurboFan-Code ist schnell.** `compute-cosine-similarity`'s Inner-Loop ist `sum += a[i] * b[i]`, auf `Float64Array`. TurboFan generiert AVX-Instructions. Abstand zu Rust-SIMD ist gering (2–3×).

2. **FFI-Fixkosten dominieren.** 109 ns Floor + 2× Buffer-Access + 1× Scalar-Return ≈ 300 ns auf 1-µs-Baseline. 30 % Fixkosten-Share. Speedup 1,2×–1,5× best case.

3. **Kein Batch-Idiom.** Users schreiben `corpus.map(doc => similarity(query, doc))` — JS-Loop über FFI-Calls = N × 300 ns FFI + N × 300 ns Rust-Compute = langsamer als reines JS (N × 1 µs).

4. **Die Rust-Antwort auf diesen Use-Case ist HNSW/ANN-Index,** nicht Per-Pair-Function. Aber `hnswlib-node`/`faiss-node` sind bereits ruled-out als C++-wrapping (→ `docs/perf-review/hnswlib-node.md`). Es gibt keinen Portfolio-Slot für "flach Pair-Distance in Rust".

**Shape-Matching:**
- 🔁 Wie `deep-equal` archived (small-work-per-call, FFI-dominated)
- 🔁 Wie `mime` (Flacher Lookup-Stil)
- ❌ Nicht wie `hnswlib`-style (Index-API ist der richtige Shape, aber der ist separately reviewed und abgelehnt aus anderem Grund)

**Benchmark-Gap-Flag:** Kein Spike nötig — architekturelle Analyse ist definitiv.

## If GO — proposed port

Nicht empfohlen. Wer Vector-Similarity auf großem Corpus braucht, nutzt HNSW/Faiss (beide selbst bereits ruled-out aus Wrapper-Gründen). Aktuell: Pure-JS bleiben, oder eigene Rust-ANN-Impl (separates Portfolio-Thema).

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/compute-cosine-similarity.md`.
