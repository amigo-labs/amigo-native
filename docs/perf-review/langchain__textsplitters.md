# Candidate review: `@langchain/textsplitters`

> **Status:** GO (als neues Paket, API-inspiriert von langchain) · **Predicted:** 🟡 Yellow (Green auf RAG-Scale, Yellow auf tweets) · **Reviewed:** 2026-04-21

## Verdict

Text-Splitting für RAG ist ein **Input-size-sensitiver Shape**: auf einem 100 KB-Whitepaper ist es sauber Green (Unicode-Segmentation + Regex-Scan + Chunk-Reassembly), auf einem 280-Zeichen-Tweet ist die Call selbst kürzer als der FFI-Floor und wir landen in der `nanoid`/`deep-equal`-Falle. Die BACKLOG-Warnung trifft den Kern: **must bench small bucket before committing**. Eine `TokenTextSplitter`-Variante hat zusätzlich die starke Kopplung an `@amigo-labs/tiktoken` — dort haben wir schon eine Singleton-NAPI-Class, die wir via Shared-State einbinden können (billigster Token-Count-Pfad im Portfolio). Der `RecursiveCharacterTextSplitter` ist der Haupt-Use-Case (>80 % der langchain-Calls im Produktions-RAG) und profitiert am meisten.

## JS package

- **npm:** [`@langchain/textsplitters`](https://www.npmjs.com/package/@langchain/textsplitters)
- **Downloads:** ~2M/Woche (BACKLOG-Zahl bestätigt, Q1 2026). Einer der größeren Kandidaten im Portfolio-Scan.
- **Exports / API surface:**
  - `RecursiveCharacterTextSplitter` (primär, 80 %+ der Nutzung): `{chunkSize, chunkOverlap, separators, keepSeparator, lengthFunction}` — probiert Separator-Liste rekursiv (default `["\n\n", "\n", " ", ""]`)
  - `CharacterTextSplitter`: simple split-an-einem-Separator + merge-bis-chunkSize
  - `TokenTextSplitter`: verwendet `tiktoken` (js-tiktoken) für Längenmessung
  - `MarkdownTextSplitter`, `LatexTextSplitter`, `HTMLTextSplitter` — pre-konfigurierte `RecursiveCharacterTextSplitter` mit Format-Separatoren
  - `.splitText(text) → string[]`, `.createDocuments(texts, metadatas) → Document[]`, `.splitDocuments(docs) → Document[]`
- **Typical input:** **ein** String pro Call. Länge stark bimodal: entweder "RAG-Doc" (5 KB – 500 KB, Median ~50 KB) oder "Chat-Message" (50 B – 5 KB, Median ~500 B).
- **Typical output:** Array von Strings, typisch 20–500 Chunks für RAG-Docs, 1–5 Chunks für kleine Texte. Chunks ~500–2000 Zeichen.
- **Realistic median use-case:** **RAG-Ingestion-Pipeline.** Ein PDF/HTML/MD wurde bereits zu Text extrahiert (→ `pdf-parse`, `marked`, `turndown`), jetzt wird der Text für Embedding-Generation in Chunks gesplittet. Ein `splitText()`-Call pro Dokument, Dokument-Anzahl 100–100 000 pro Ingestion-Job. Zweiter Case: **Online-Chunking** im Chat-Flow (User-Message splitten bevor sie ins LLM-Context-Window geht). Dort sind Texte deutlich kleiner, aber Call-Frequency höher.

## Rust replacement

- **Candidate crate(s):**
  - [`text-splitter`](https://crates.io/crates/text-splitter) — **primär**. Von Ben Brandt, direkt inspiriert von langchain's TextSplitter. Hat `TextSplitter`, `MarkdownSplitter`, `CodeSplitter`. Unterstützt Character- und Token-basierte Längen. Aktiv, MIT.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — Baustein für Grapheme/Word-Boundaries. Regex-Engine für Separator-Splitting: `regex` crate (BurntSushi, schnell, safe).
  - Custom-Port: `RecursiveCharacterTextSplitter` ist ~200 Zeilen algorithmus-wert — recursive-descent durch Separator-Liste, greedy-merge zu `chunkSize`, Overlap-Handling beim Chunk-Zusammenbau. Direkt portierbar.
- **Maintenance / license:** `text-splitter` MIT, aktiv. `unicode-segmentation` MIT, BurntSushi, Standard-Crate. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **`lengthFunction`-Callback** — langchain erlaubt eine beliebige JS-Funktion für Längenmessung. Das **kann nicht** über FFI reichen (Callback-Boundary = `xml`/Object-Traversal-Antipattern). Lösung: wir bieten drei Enums an: `'chars'` (default), `'tiktoken:cl100k'`, `'tiktoken:o200k'` — alle drei Rust-seitig. Custom-JS-length-Function ist Nicht-Support (dokumentieren).
  - **`keepSeparator`-Semantik** — langchain v0.3+ hat keepSeparator='start'|'end'|false Spelling. Muss exakt gematcht werden, sonst ranken Chunks anders im Retrieval.
  - **Markdown/HTML-Separator-Profile** — langchain hat sehr lange Separator-Arrays für MD/HTML/Latex. Parity auf den Strings ist trivial, aber die REIHENFOLGE matters (Recursive probiert in Reihenfolge).
  - **`createDocuments`-Metadata-Shape** — Metadata-Objekte über FFI reichen ist mühsam. Wir bieten nur `splitText(text) → string[]` als Hot-Path; Documents-Konstruktion macht der User in JS nach dem Split-Return.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:26`:
> **@langchain/textsplitters** (~2M). Recursive character + token-aware splitters via `unicode-segmentation` plus custom logic. Green on RAG-scale documents, Red on tweet-sized chunks — must bench small bucket before committing.

Kategorisierung "Predicted Yellow". Review bestätigt: Yellow ist die richtige Vorhersage, mit Green-Upgrade-Pfad wenn RAG-Median-Case durchgehend ≥2× trifft.

Abgrenzung:
- Gegen `docs/perf-review/pdf-parse.md`: Text-Extraction liefert den Input, wir splitten ihn. Sequenziell in der gleichen Pipeline. Gemeinsames Paket-Set ergibt Shapes.
- Gegen `docs/perf-review/tiktoken.md`: `TokenTextSplitter`-Variante ist die Integration. Unser `@amigo-labs/tiktoken` hat bereits die Singleton-NAPI-Class — wir rufen sie direkt Rust-intern, **kein** zweites FFI-Crossing pro Chunk-Längen-Check.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Bimodal.** Tweet (500 B → 1–2 Chunks): ~5–20 µs in JS, FFI-Floor 109 ns = ~1 % (tolerabel) aber Rust-Work-Delta ist dünn. 50 KB-Doc → 100 Chunks: ~500 µs – 2 ms in JS, Rust ~50–200 µs → **>5×-Speedup realistisch**. 500 KB-Doc → 1000 Chunks: ~5–20 ms JS, Rust ~500 µs – 2 ms → **≥10×-Speedup**. |
| Input size distribution | **String-Input.** 500 B – 500 KB. UTF-16→UTF-8-Konversion kostet ~0,35 ns/byte (BASELINE.md:27). 500 KB = 175 µs Transport. Für einen 500 KB-Doc ist das ≤10 % vom Rust-Compute — OK. Für 50 KB-Doc (Median): 17 µs Transport auf ~100 µs Compute = **17 %**, grenzwertig aber noch Green. |
| Output size distribution | **`Vec<String>`-Output** — eine bekannte FFI-Kostenfalle. 100 Chunks × ~1 KB = 100 Strings zu marshallen. Pro-String-Overhead ~180 ns + UTF-8→UTF-16-Konversion. Grober Overhead: 100 × 180 ns + 100 KB × 0,35 ns/byte = **53 µs**. Für 500 KB-Doc ist das OK. Für 5 KB-Doc (wenige Chunks) noch besser. **Alternative**: `splitTextToBuffer(text) → Buffer` mit internem NDJSON-Format, eine Konversion. Fast-Follow-Hebel für extreme Cases. |
| Reusable setup (stateful potential) | **Mittel.** Config (chunkSize, separators, stemmer) könnte in einer `Splitter`-Class gecached werden. Regex-Kompilation für Separator-Patterns ist nicht-trivial (~µs) und sollte definitiv NICHT pro-Call passieren. Empfehlung: Class-API mit Config-in-Constructor. |
| Batch-usage realism | **Hoch.** RAG-Ingestion splitet 10k-100k Docs. `splitTextsBatch(texts: string[]) → string[][]` ist der offensichtliche Hebel. Rayon-parallelisierbar (embarrassingly — jeder Doc unabhängig). |
| FFI-share estimate vs. Rust work | 500 KB-Doc: <5 % (Green). 50 KB-Doc: ~20 % (Green-grenzig). 500 B-Doc: ~50 % (Yellow/Red). |

## Classification reasoning

`@langchain/textsplitters` ist ein **Input-size-abhängiger Shape** und die Klassifikation hängt davon ab, welchen Median-Case wir priorisieren:

1. **RAG-Ingestion-Use-Case ist Green.** Dokumente von 10 KB aufwärts liefern genug Rust-Compute, um FFI zu amortisieren. `text-splitter` crate + `regex` crate sollten 5–15× gegen pure-JS-Splitter liefern. Das ist unser Haupt-Sell — die 2M-Downloads kommen zu großem Teil aus RAG-Pipelines.

2. **Online-Chat-Chunking ist Yellow.** Kurze User-Messages (200–2000 Zeichen) sind im Grenzbereich. Rust-Work auf 1 KB ist ~20–50 µs, FFI-Overhead (Input UTF-Konv + Output Vec<String>) ~5–10 µs = **20–30 % Overhead-Share**. Speedup wahrscheinlich 1,5–2×, Yellow-klassifiziert. Nicht Red, weil `lengthFunction` in JS (der Chat-Use-Case nutzt oft token-basierte Length via `tiktoken`) selbst ~50 µs kostet und wir das Rust-intern billiger machen.

3. **Keine Falle-Kategorie (Tweets, 50-char-Strings) muss explizit out-of-scope sein.** Wenn jemand `splitText("Hello world")` ruft, kostet es mehr FFI als Compute. Wir dokumentieren: "für Inputs <500 Zeichen nutze den direkten String" und verweisen auf die Benchmark-Tabelle.

4. **`TokenTextSplitter` ist der Killer-Sub-Case.** Der hat langchain-seitig einen JS→WASM-Crossing (`js-tiktoken` oder `tiktoken`-WASM) PLUS den TextSplit. Wir können beide Rust-seitig machen — potentiell 5–20× Speedup weil wir das Zwei-Boundary-Problem kollabieren.

5. **Callbacks rausdesignen.** Der `lengthFunction`-Parameter muss verschwinden. Ersatz: Enum. Der Callback-Boundary-Killer ist nicht-verhandelbar — siehe `xml`-Lehre (`docs/post-mortems/xml.md`).

**Shape-Matching:**
- ✅ Wie `sanitize-html` (Regex-Scan + Reassembly, String-heavy, Green auf Median)
- ✅ Wie `commonmark` (Paket-Kategorie mit Format-Variants — MD/HTML/Latex-Splitter wie `commonmark` vs `gfm`)
- ⚠️ Wie `csv` (Input-size-bimodal — `csv`'s kleiner-Bucket war auch grenzwertig, wurde durch `parseToJson` über Buffer gerettet; ähnlicher Hebel hier mit Buffer-Output)
- ❌ Nicht wie `mime` (nicht Lookup-Style — echter Parser)
- ❌ Nicht wie `deep-equal` (langer genug Input, dass Rust-Compute FFI dominiert — für den Median-Case)

**Benchmark-Gap-Flag:** Drei Buckets müssen gemessen werden (tweet / chat-message / rag-doc). Ein Gate-Failure auf tweet-Bucket ist dokumentarisch (Black-Flag für Caller), nicht Package-Kill — wenn chat + rag beide ≥2×, ist der Port Green.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/text-splitters` (Plural wie langchain, plus `-splitters` statt `-textsplitters` für Klarheit in `@amigo-labs/*`-Namespace)
- **Primary API sketch:**
  ```ts
  export type LengthMode = 'chars' | { tiktoken: 'cl100k_base' | 'o200k_base' | 'p50k_base' };

  export interface SplitterConfig {
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
    keepSeparator?: 'start' | 'end' | false;
    lengthMode?: LengthMode;  // ersetzt lengthFunction
  }

  export class RecursiveCharacterTextSplitter {
    constructor(config: SplitterConfig);
    splitText(text: string): string[];
    splitTextsBatch(texts: string[]): string[][];
    splitTextToBuffer(text: string): Buffer;  // NDJSON, für hot paths
  }

  export class MarkdownTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class HTMLTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class LatexTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class CodeSplitter extends RecursiveCharacterTextSplitter {
    constructor(config: SplitterConfig & { language: 'typescript' | 'python' | 'rust' | ... });
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Tweet (500 B → ~1 Chunk):** bench run, 10k iterations. Ziel ≥1,0× vs. langchain (Parität OK, nicht primärer Win-Case)
  - **Chat-Message (5 KB → ~3 Chunks):** Ziel ≥1,5× (Yellow-Grenze)
  - **RAG-Doc small (50 KB → ~50 Chunks):** Ziel ≥3× (Green-Grenze Haupt-Case)
  - **RAG-Doc large (500 KB → ~500 Chunks):** Ziel ≥5×
  - **Batch 100 × RAG-Docs 50 KB:** Ziel ≥6× (rayon-Hebel)
  - **TokenTextSplitter cl100k auf 50 KB:** Ziel ≥5× vs. langchain + `js-tiktoken`
- **Acceptance thresholds (Green gate):** ≥3× auf RAG-small UND ≥5× auf RAG-large UND ≥1× auf Tweet. Chat-Message muss nicht Green sein — wenn Yellow, dokumentieren wir Chat-Use-Case als "Yellow-path, füge Overhead hinzu bei <5 KB".
- **Risks:**
  - **Parity der Separator-Rekursions-Ordnung** — langchain hat historisch die Separator-Liste zwischen Major-Versionen gedreht. Wir pinnen an v0.3 und dokumentieren Divergenzen
  - **`lengthFunction`-Breaking-Change** — User mit Custom-JS-lengthFunction können nicht migrieren. Dokumentieren als akzeptable Scope-Einschränkung
  - **Kopplung an `@amigo-labs/tiktoken`** — `TokenTextSplitter` verlangt, dass tiktoken-Backend im selben NAPI-Prozess sitzt. Architektur: Cargo-Workspace-Dep auf `tiktoken`-Crate (nicht npm-Dep auf `@amigo-labs/tiktoken`)
  - **Binary-Size** — primär `regex` + `unicode-segmentation` + `text-splitter`, alles kompakt. Erwartung: ~1–2 MB pro Target, unproblematisch
  - **Semver-Instabilität von langchain** — langchain v0.3.x ist aktuell, v0.4 steht an. Wir pinnen an die v0.3-API und müssen Divergenzen ab v0.4 dokumentieren

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag bleibt, Status-Update auf "Reviewed GO 2026-04-21 (Yellow-predicted, Green auf RAG-scale). Must bench tweet/chat/rag buckets before commit. Callback-rausdesignen: `lengthFunction` → Enum."
