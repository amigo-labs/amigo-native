# Candidate review: `stopword`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`stopword.removeStopwords(tokens, stopWordsList) → filteredTokens` ist **Hashset-Lookup in einer Schleife** — die `mime`-Kategorie. Für jedes Token wird ein Set-`has()`-Call gegen die Stopword-Liste ausgeführt; V8's Map/Set-Implementation ist auf native-Geschwindigkeit getuned und FFI-Floor + Array-Marshalling pro Call würden das 3–10× langsamer machen als pure JS. Es gibt kein Input-Size-Rescue: mehr Tokens bedeutet mehr Array-Marshalling-Kosten, proportional zum Compute. Dieselbe Lehre wie `mime-types`/`dotenv`.

## JS package

- **npm:** [`stopword`](https://www.npmjs.com/package/stopword)
- **Downloads:** ~1M/Woche
- **Exports / API surface:**
  - `removeStopwords(tokens: string[], list?: string[]) → string[]`
  - Pre-built Sprach-Listen: `stopword.eng`, `stopword.deu`, `stopword.fra`, ... (50+ Sprachen)
- **Typical input:** `string[]` von 10–10 000 Tokens. Stopword-Liste (optional) von 50–500 Wörtern. Median ~100 Tokens.
- **Typical output:** Gefiltertes `string[]`, typisch 40–70 % der Input-Länge (Stopwords entfernt).
- **Realistic median use-case:** **NLP-Preprocessing für Search-Index** — nach Tokenization, vor Stemmer, Stopwords raus. Ruft typischerweise in Doc-Processing-Loop: für jedes Dokument einmal `removeStopwords(tokens, eng)`. Second case: **Query-Preprocessing** in Search-Frontends.

## Rust replacement

- **Candidate crate(s):** Trivial — `FxHashSet<&str>` aus embedded-Liste, `.filter(|t| !set.contains(t)).collect()`. Rust-Side 20 Zeilen.
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** Sprach-Listen-Divergenz — `stopword.eng` ist leicht anders als NLTK's oder spaCy's englische Liste. Parity = wörtlich die `stopword`-Listen embedden (sind schon public domain).

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "Hashset lookup per call — lookup-style FFI trap, same as `mime`." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/mime.md` (⚫ Black): identischer Shape — Set-Lookup-Call. Einziger Unterschied: `stopword` filtert ein Array statt ein Single-Lookup zu machen, was FFI-Output-Marshalling hinzufügt (Array-out = schlimmer, nicht besser).
- Gegen `docs/perf-review/natural.md` (GO, Batch-Only-Subset): Stemmer in Rust integriert Stopword-Filter **Rust-intern** in `tokenizeAndStem(text, {stopwords: true})` — kein FFI-Crossing pro Filter. Das ist der richtige Shape, nicht standalone stopword-Package.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial.** 100 Tokens × Set-Lookup: ~3–5 µs JS, ~1 µs Rust. Δ ≈ 2–4 µs. |
| Input size distribution | `Vec<String>` Input: 100 × ~200 ns = **20 µs FFI-Transport** auf 100 Tokens. Dominiert Rust-Compute komplett. |
| Output size distribution | `Vec<String>` Output: ~60–70 Strings × 200 ns = **12–14 µs Marshalling**. Weiterer Overhead. |
| Reusable setup (stateful potential) | Irrelevant (Stopword-Liste ist embedded, statisch). |
| Batch-usage realism | Null — die Call IS der Batch (ein Array, ein Filter). Kein nächster-Ebene-Batch denkbar. |
| FFI-share estimate vs. Rust work | ~30 µs Transport auf ~1 µs Compute = **3000 %** Overhead. Strukturell Black. |

## Classification reasoning

1. **V8 Set-Lookup ist native-speed.** `Set.prototype.has` ist auf V8-Hot-Path kompiliert. `Array.prototype.filter` mit einer Set-Lookup-Callback ist monomorphic und vectorized.

2. **Array-in-Array-out ist die `Vec<String>`-Falle.** `docs/BASELINE.md:32` zeigt 43 ns/Element für u32-Arrays — `String`-Marshalling ist mindestens 2–3× so teuer (UTF-Konv plus Length-Prefix). 100 Tokens-Input + Output-Filter = **~30 µs pure FFI-Transport** auf ~1 µs Rust-Compute.

3. **Integration bei `@amigo-labs/stemmer` ist der richtige Shape.** Dort ist Stopword-Removal ein Boolean-Flag im `tokenizeAndStem(text, {stopwords: true})`-Call, Rust-intern geloopt. Input: ein Text-String (substantielles Compute). Output: eine Token-Liste. Ein FFI-Crossing für den Gesamt-Pfad Tokenize+Stopword+Stem.

**Shape-Matching:**
- 🔁 Wie `mime` / `mime-types` (Lookup-Style)
- 🔁 Wie `dotenv` (kurzer V8-JIT-Parser)
- 🔁 Wie `deep-equal` archived (Trivial-Work, FFI-dominated)
- ❌ Integration in `@amigo-labs/stemmer` ist der richtige Weg

**Benchmark-Gap-Flag:** Kein Spike nötig — FFI-Transport-Mathematik ist eindeutig.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/stopword.md`. Die Funktion ist integriert in `@amigo-labs/stemmer` (siehe `docs/perf-review/natural.md`).
