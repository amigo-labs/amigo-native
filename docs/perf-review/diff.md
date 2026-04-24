# Candidate review: `diff`

> **Status:** GO (als Drop-in, mit Offset-API als Green-Hot-Path) · **Predicted:** 🟡 Yellow leaning 🟢 (mit Offset-API), 🟡 Yellow (mit Hunk-Object-Array) · **Reviewed:** 2026-04-21

## Verdict

Text-Diff ist ein **Algorithmus-heavy, Output-shape-sensitive** Paket. Myers (default) und Patience sind O(N×M) in der Zellenanzahl — auf 10 KB × 10 KB Input ist das millisekunden echter Arbeit in JS. Rust `similar` crate hat SIMD-beschleunigte Common-Prefix/Suffix-Erkennung plus optimierte Snake-Search, typisch 5–15× faster als jsdiff auf Document-Level-Inputs. Die Output-Form ist das bekannte `Vec<Object>`-Problem: jsdiff gibt ein Array von `{value, added, removed, count}`-Hunks zurück, jeweils mit Content-String. Marshalling von 200 Hunks × Strings frisst den Gewinn auf kleinen Inputs. Lösung — dieselbe wie bei `sbd`: ein **Offset-basierter Hot-Path** (`diffToOffsets(a, b) → Uint32Array`) gibt nur die Hunk-Grenzen zurück, Content-Slicing macht der Caller lazy. Die Drop-in-Form (`Vec<Hunk>`) bleibt verfügbar aber ist Yellow. Line-Diff (~90 % der npm-`diff`-Nutzung) ist Green unabhängig vom Output-Shape, weil Lines weniger und fetter sind als Chars.

## JS package

- **npm:** [`diff`](https://www.npmjs.com/package/diff)
- **Downloads:** ~200M/Woche (Q1 2026, BACKLOG-Zahl bestätigt). Top-10 der am meist-gedownloadeten utility-Packages.
- **Exports / API surface:**
  - `diffChars(oldStr, newStr, opts?)` — Char-by-char
  - `diffWords(oldStr, newStr, opts?)` / `diffWordsWithSpace(...)` — Word-tokenized
  - `diffLines(oldStr, newStr, opts?)` / `diffTrimmedLines(...)` — Line-based (**der häufigste Fall**)
  - `diffSentences(oldStr, newStr, opts?)` — Sentence-based
  - `diffCss(...)`, `diffJson(obj1, obj2)` — typed
  - `createPatch(fileName, oldStr, newStr, oldHeader, newHeader, opts?)` → Unified-Diff-Format-String
  - `applyPatch(source, patch, opts?)` — Reverse-Op
  - `parsePatch(diffStr)`
- **Typical input:**
  - 2 Strings (old, new). Größen hoch variable:
    - Git-like line-diff: 100 B – 100 KB
    - Text-edit-diff: 1 KB – 50 KB
    - Log-file-compare: 10 KB – 10 MB
    - Code-review-diff: typisch 500 B – 20 KB per File
- **Typical output:** `Array<{value: string, added?: bool, removed?: bool, count?: number}>`. Größe: bei gleichen Strings 1 Hunk, bei völlig verschiedenen ~2 × LineCount Hunks.
- **Realistic median use-case:** **Code-Review-Tooling** (diff zwischen File-Versionen, line-based). **Test-Snapshot-Diff** (Vitest/Jest erwartet-vs-actual, char/line). **Merge-Conflict-Anzeige** in Web-UIs. **Text-Edit-History** in Collaborative-Editing-Backends. **Config-Change-Preview**. Alle Cases: **ein Call pro Vergleich**, Inputs variabel aber meist 1–50 KB. Keine Chain-API, kein Stateful.

## Rust replacement

- **Candidate crate(s):**
  - [`similar`](https://crates.io/crates/similar) — **primär.** Von Armin Ronacher. Myers + Patience + LCS-Algorithmen. Unified-Diff-Format-Output. Char/Word/Line-Tokenization built-in. Aktiv, MIT.
  - [`imara-diff`](https://crates.io/crates/imara-diff) — alternative, schneller auf großen Inputs, aber kleiner API-Surface.
  - [`difference`](https://crates.io/crates/difference) — älter, weniger features, nicht empfohlen.
- **Maintenance / license:** `similar` MIT/Apache, Ronacher, exzellent maintained. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Hunk-Output-Format** — jsdiff kombiniert unchanged/added/removed in einem flachen Array. `similar` hat `TextDiff::iter_all_changes()` der ein Iterator liefert, kann mapped werden.
  - **`ignoreCase`, `ignoreWhitespace`, `newlineIsToken`** — jsdiff hat diverse Options. similar unterstützt die meisten, aber `ignoreCase` vielleicht manuell.
  - **diffJson**-Semantik — jsdiff's `diffJson` stringifiziert beide Objekte mit `JSON.stringify(sorted)` und diff-t die Lines. Replizierbar, aber Parity auf Key-Order-Sorting-Details checken.
  - **Patch-Format-Parity** — `createPatch`/`applyPatch` folgen dem Unified-Diff-Standard, aber `@@ -a,b +c,d @@`-Header-Format und Trailing-Newline-Handling haben Divergenz-Risiko gegen GNU-`diff`/`patch`.
  - **Callbacks** — `diffArrays(oldArr, newArr, opts)` mit `opts.comparator` ist Callback-Variante. Für String-Arrays ist das vermeidbar (pre-serialize), für Object-Arrays nicht — wir schneiden Object-Array-Diff aus dem Scope raus (oder bieten nur String-Key-Based).

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "Under investigation — General utilities → Predicted Yellow"): ergänzt 2026-04-21. Review bestätigt Yellow-Prediction mit Green-Upgrade-Pfad über Offset-API.

Abgrenzung:
- Gegen `docs/perf-review/sbd.md` (GO Yellow→Green mit Offset-API): **identisches Output-Shape-Problem**, identische Lösung. Review-Pattern wiederverwendet. Das ist der "Industrialisierungs"-Moment — wir haben das Pattern gesehen (xxhash, sbd), wir wissen den Fix.
- Gegen `docs/perf-review/deep-equal.md` (archived 🔴): ähnliche API-Shape (zwei Inputs, einer-Boolean-oder-klein-Output), aber Compute-Größenordnung fundamental anders. `diff` auf 20 KB ist Millisekunden; `deep-equal` auf flat-7-key ist 500 ns. Deshalb umgekehrtes Verdict.
- Gegen `docs/perf-review/levenshtein.md` (archived 🔴): Warnung — Char-Level-Diff auf kurzen Strings könnte in denselben FFI-Floor-Trap fallen. Deshalb realistischer Median = Line-Level und mittlere Inputs.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Input-grösen-abhängig.** 1 KB × 1 KB `diffLines`: ~100 µs jsdiff, ~20–50 µs Rust → 2–5×. 20 KB × 20 KB `diffLines`: ~2–5 ms jsdiff, ~200–500 µs Rust → **5–10×**. 100 KB × 100 KB `diffChars`: ~200 ms – 2 s jsdiff (O(N²) dominant), ~20–100 ms Rust → **10–20×**. `diffChars` auf sehr langen Strings ist traditionelles diff-Nightmare — dort holen wir am meisten. |
| Input size distribution | Zwei Strings, kombinierte Größe 200 B – 20 MB. UTF-Konv 0,35 ns/byte × 2 (beide Strings) = ~70 µs bei 100 KB combined. Auf ~500 µs Rust = 14 %. Grenzwertig aber Green. |
| Output size distribution | **Hauptproblem.** Line-Diff 20 KB vs. 20 KB, 30 % geändert: ~100 Hunks × je Value-String ~50 Chars = 100 × (200 ns FFI-Wrap + 50 × 0,35 ns UTF-Konv) = **30 µs Marshalling** + zusätzliche V8-Object-Alloc-Pressure. Auf 500 µs Rust = 6 %, OK. Char-Diff 20 KB vs. 20 KB, 30 % geändert: ~6000 Hunks × je Value-String ~2 Chars = **1,2 ms Marshalling** auf 500 µs Rust-Compute = **>100 % Overhead, Red-Territorium**. |
| Reusable setup (stateful potential) | Niedrig. Kein Key/Schema/Regex-Setup. Jeder Diff ist Fresh-Input. |
| Batch-usage realism | Mittel. Code-Review-Tools haben batch-Diff-Workloads (diff 100 files). `diffManyLines(pairs: [string, string][]) → ...` sinnvoll. Rayon-parallelisierbar. |
| FFI-share estimate vs. Rust work | Mit Hunk-Array: Line 5–15 %, Word ~20 %, Char 100 %+ (Red). Mit Offset-Array: <2 % über Distribution (durchgehend Green). |

## Classification reasoning

`diff` zeigt **exakt** dasselbe Muster wie `sbd` — die Output-Dimension entscheidet die Klassifikation:

1. **Line-Diff ist der Median-Case und Green in beiden Output-Varianten.** 90 % der `diff`-npm-Calls sind `diffLines` oder `createPatch` (line-basiert). Die Hunk-Anzahl ist moderat (10–200), Value-Strings sind fett (50–200 Chars), Output-Marshalling-Overhead amortisiert. Speedup 5–10×.

2. **Char-Diff ist der Red-Trap.** Auf tausenden 2-Char-Hunks ist Output-Marshalling-Overhead > Rust-Compute. Zwei Wege raus:
   - **Offset-API** — `diffCharsToOffsets(a, b) → Uint32Array`: Jeder Eintrag ist `[type, oldStart, oldEnd, newStart, newEnd]` oder kompakter als packed-Format. Konstante Size, flat Buffer-Transport.
   - **Dokumentieren als "for char-level diffs on large strings, use the offset API"** im README.
   Beide Optionen erhalten Drop-in für Line-Level, bieten Green-Path für Char-Level.

3. **`createPatch`/`applyPatch` sind eigener Green-Case.** Die produzieren Unified-Diff als **einen String** (keine Hunk-Array!). Output-Marshalling = einmalige UTF-Konv. Klassisches Buffer-in/String-out-Green-Shape. Speedup 5–15× erwartbar.

4. **200M/Woche Adoption ist enorm.** Top-Tier. Jedes `jest`/`vitest`-Install pulled `diff` transitiv. Jeder CI-Diff-View nutzt es. Selbst bei Yellow-Classification ist der Portfolio-Value gegeben — aber Green ist mit Offset-API realistisch.

5. **Keine API-Shape-Fallen sonst.** Kein Chain, keine Callbacks (außer `diffArrays`-Comparator, den wir ausschließen). Kein Plugin-System. Kein Stateful. Purer Algo-Wrapper. Exakt das was NAPI-RS gut macht.

**Shape-Matching:**
- 🔁 Wie `sbd` (Output-Array-Shape-Sensitivität, Offset-API als Lösung)
- 🔁 Wie `xxhash` pre-fix (Vec<BigInt> war Yellow, Buffer-Output wurde Green)
- ✅ Wie `inflate` (pure algo, bytes-heavy compute, Buffer-in/Buffer-out viable)
- ✅ Wie `@amigo-labs/commonmark` (String-in, substantial compute, String-out for patch-mode)
- ❌ Nicht wie `levenshtein` archived (UTF-16/UTF-8-Marshalling war hier auf Input dominant; `diff` hat größere Inputs die das amortisieren, plus Lines-als-Tokens)
- ❌ Nicht wie `deep-equal` archived (Work-pro-Call ist >> FFI-Floor)

**Benchmark-Gap-Flag:** Kritisch — drei Tokenization-Level × drei Input-Größen × zwei Output-Varianten = 18 Szenarien. Realisierbar, aber umfangreichstes Bench-Set im Portfolio. Priorisierung: `diffLines` × {1 KB, 20 KB, 100 KB} × {Hunks, Offsets} zuerst (das deckt 80 % realer Nutzung).

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/diff` (Drop-in-Konvention)
- **Primary API sketch:**
  ```ts
  export interface Hunk {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export interface DiffOptions {
    ignoreCase?: boolean;
    ignoreWhitespace?: boolean;
    newlineIsToken?: boolean;
  }

  // Drop-in-Form (Yellow-path, dokumentiert)
  export function diffChars(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffWords(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffWordsWithSpace(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffLines(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffTrimmedLines(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffSentences(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffCss(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffJson(oldObj: any, newObj: any, opts?: DiffOptions): Hunk[];

  // Zero-copy Hot-Path (Green-path) — eigener Namensraum da API anders
  export type DiffOpType = 0 | 1 | 2;  // 0=equal, 1=added, 2=removed
  export function diffCharsToOffsets(oldStr: string, newStr: string, opts?: DiffOptions): Uint32Array;
  // Layout: [type, oldStart, oldEnd, newStart, newEnd, ...] repeating
  export function diffLinesToOffsets(oldStr: string, newStr: string, opts?: DiffOptions): Uint32Array;

  // Patch-API (eigenes Green-Shape, String-out)
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    opts?: DiffOptions
  ): string;
  export function applyPatch(source: string, patch: string, opts?: DiffOptions): string | false;
  export function parsePatch(diffStr: string): ParsedPatch[];

  // Batch-Hebel (v0.2)
  export function diffLinesBatch(pairs: Array<[string, string]>, opts?: DiffOptions): Hunk[][];
  ```
- **Must-have benchmark scenarios (Gate):**
  - **diffLines 1 KB × 1 KB (30 % changed):** Ziel ≥2× (Yellow-Grenze)
  - **diffLines 20 KB × 20 KB:** Ziel ≥5× (Green-Gate-Hauptfall)
  - **diffLines 100 KB × 100 KB:** Ziel ≥8×
  - **diffLinesToOffsets 20 KB × 20 KB:** Ziel ≥8× (Offset-API-Value-Proposition)
  - **diffChars 5 KB × 5 KB (10 % changed):** Ziel ≥3× (Hunks) / ≥10× (Offsets)
  - **diffChars 50 KB × 50 KB:** Ziel ≥5× (Hunks) / ≥15× (Offsets) — **killer-bench für Offset-API**
  - **createPatch 20 KB × 20 KB:** Ziel ≥5× (reine String-Out, kein Marshalling)
  - **applyPatch 20 KB + Patch:** Ziel ≥3×
  - **Parity-Conformance:** 500-Pair-Corpus gegen jsdiff, byte-identical Hunks auf ≥98 %
- **Acceptance thresholds (Green gate):** `diffLines` ≥5× auf 20 KB, `diffLinesToOffsets` ≥8× auf 20 KB, `createPatch` ≥5×, `diffChars` über Offset-API ≥10× auf 50 KB. Char-Diff mit Hunks darf Yellow bleiben (dokumentiert).
- **Risks:**
  - **Output-API-Dualität** — User müssen zwischen Hunk-Array (Drop-in) und Offsets (Performance) wählen. README muss deutlich die Performance-Trade-offs zeigen
  - **Parity auf malformed-Input** — NUL-Bytes, invalid-UTF-8-Sequences, sehr lange Lines (>1 MB) — Edge-Cases testen
  - **Patch-Format-Subtleties** — `@@`-Header-Counts, Context-Line-Handling, Trailing-Newline-Preservation
  - **Binary-Size** — `similar` + Deps ~1–2 MB, unproblematisch
  - **diffArrays-API** — Comparator-Callback ausgeschlossen (Callback-Antipattern). User müssen pre-normalize. Scope-Doc im README

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung, Yellow-Prediction mit Green-Upgrade über Offset-API).
