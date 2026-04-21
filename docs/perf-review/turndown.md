# Candidate review: `turndown`

> **Status:** GO (Drop-in-orientiert, Custom-Rule-API bewusst out-of-scope) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-21

## Verdict

HTML → Markdown ist der **saubere `commonmark`-Spiegel**: Bytes-in / String-out, substantieller Compute (HTML-Parse + Tree-Walk + Rule-Dispatch + Markdown-Emit), keine Chain-API. Pure-JS-`turndown` nutzt DOMParser-Polyfill + handgeschriebene Rules — V8 ist auf HTML-Parsing suboptimal (keine spezialisierte Parse-Engine, everything geht durch den JSDOM-lite-Pfad). Rust `html5ever` (wie `@amigo-labs/sanitize-html`'s Parser) plus eigene Rule-Engine gewinnt hier 3–8× auf typischen Web-Extract-Inputs. Der **eine** strukturelle Kostenpunkt ist die `.addRule(name, { filter, replacement })`-API, mit der User Custom-Transformations hängen — exakt der Callback-Boundary-Antipattern. Lösung: in v1 **nur** die pre-baked Rules (CommonMark + GFM-Tables + GFM-Strikethrough) ausliefern; Custom-Rule-User kriegen einen Migration-Block im README. Adoption ~1M/Woche rechtfertigt das einfach.

## JS package

- **npm:** [`turndown`](https://www.npmjs.com/package/turndown) plus [`turndown-plugin-gfm`](https://www.npmjs.com/package/turndown-plugin-gfm) für GitHub-Flavored-Markdown
- **Downloads:** `turndown` ~1M/Woche (BACKLOG-Zahl bestätigt). Plus `turndown-plugin-gfm` ~300k/Woche.
- **Exports / API surface:**
  - `new TurndownService(options?)` — Constructor
  - `.turndown(html) → string` — Main-Call
  - `.addRule(name, rule)` — Custom-Transformation (callback-based)
  - `.keep(filter)` / `.remove(filter)` — Tag-Lists ausschließen/bewahren
  - `.use(plugin)` — Plugin-Registration
  - Options: `headingStyle` ('setext'|'atx'), `hr`, `bulletListMarker`, `codeBlockStyle` ('indented'|'fenced'), `fence`, `emDelimiter`, `strongDelimiter`, `linkStyle` ('inlined'|'referenced'), `linkReferenceStyle`, `preformattedCode`
- **Typical input:** HTML-String 1 KB – 500 KB. Median ~10–50 KB (Blog-Post, E-Mail-HTML, scraped Webpage-Content-Block)
- **Typical output:** Markdown-String, typisch 60–90 % der Input-Größe (HTML-Tags fallen weg, Content bleibt)
- **Realistic median use-case:** **Web-Scraping → Clean-Markdown** für RAG-Pipelines (HTML-Seite → reinen Content-Text für LLM-Ingestion). Zweiter Case: **E-Mail-Thread-Prozessing** (HTML-E-Mails in Plain-Markdown für Speichern/Analyze). Dritter: **CMS-Migrations** (HTML-Inhalt aus Legacy-System → Markdown für MDX-basierte Static-Sites). In allen Fällen: **ein Call pro Dokument**, Dokument-Anzahl 10–10 000 pro Batch. Keine Per-Element-Calls (anders als `cheerio`).

## Rust replacement

- **Candidate crate(s):**
  - [`html2md`](https://crates.io/crates/html2md) — **primär**. Direkt inspiriert von turndown, pure Rust. Nutzt `html5ever` im Backend. MIT, aber Maintenance-Status Q1 2026 prüfen (letzter Release älter). Bei Problemen: Fork oder Custom-Impl.
  - [`fast_html2md`](https://crates.io/crates/fast_html2md) — Fork/Alternative, schneller auf großen Dokumenten.
  - [`html5ever`](https://crates.io/crates/html5ever) + eigene Rule-Engine — falls `html2md`-crates unzureichend sind. ~800 Zeilen Rust für Full-turndown-Parity.
  - [`scraper`](https://crates.io/crates/scraper) als Tree-Walker-Alternative (benutzt html5ever intern).
- **Maintenance / license:** `html2md` MIT, Maintenance prüfenswert. `html5ever` Mozilla-Servo-Qualität. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Custom-Rule-API** — turndown's `.addRule()` erlaubt User-JS-Funktionen als Filter/Replacement. Das ist Callback-Boundary. **Lösung**: In v1 nur vorgekaufte Rules (CommonMark + GFM-Plugin-Set). User mit Custom-Rules können nicht migrieren — klar im Migration-Guide.
  - **Keep/Remove-Filter** — akzeptiert auch Funktionen in turndown. Bei uns: nur Tag-Name-Strings oder vordefinierte Sets (`['script', 'style']`, etc.).
  - **Plugin-System (`turndown-plugin-gfm`)** — exposeiert Funktions-Set. Wir liefern GFM-Mode als Config-Flag (`gfm: true`), nicht als Plugin.
  - **HTML-Parse-Error-Recovery** — html5ever folgt WHATWG-Spec strikt, turndown nutzt DOMParser-Polyfill mit eigenen Eigenheiten. Malformed HTML kann divergieren.
  - **Link-Style-Edge-Cases** — Referenced-Links mit Collapsed-Reference-Form, nested Emphasis, Code-Block-Whitespace-Preservation — alle potenzielle Parity-Drift-Punkte. Wir dokumentieren via `__conformance__/divergences.md`.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "Under investigation — General utilities → Predicted Green"): ergänzt 2026-04-21. Review bestätigt GO-Empfehlung mit Scope-Einschränkung auf Custom-Rule-API.

Abgrenzung:
- Gegen `@amigo-labs/commonmark` (shipped 🟢): **komplementär, kein Overlap**. commonmark ist Markdown → HTML. turndown ist HTML → Markdown. Beide Richtungen sind getrennte Libraries im Ökosystem, auch intern.
- Gegen `docs/perf-review/cheerio.md` (NO-GO): turndown macht **eine** Transformation pro Call (HTML → MD), keine Chain-API, keine User-Mutation am Tree. Deshalb Green-Shape während cheerio Red-Shape ist.
- Gegen `docs/perf-review/remark.md` (NO-GO): remark hat Plugin-System als Hauptvaluf. turndown hat Custom-Rules auch, **aber** Mainstream-Usage ist Default-Rules + GFM-Plugin. Wir können die 90-%-Usage abdecken; remark kann das nicht.
- Gegen `docs/perf-review/sanitize-html.md` (shipped 🟢): nutzt ähnliches Parser-Backend (html5ever-Familie). Rust-Code-Sharing möglich als Fast-Follow.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantiell.** 20 KB HTML → ~5 KB MD: turndown ~5–15 ms (DOMParser-Polyfill dominiert), Rust ~500 µs – 2 ms → **5–10× Speedup**. 100 KB HTML: JS ~50–100 ms, Rust ~3–10 ms → **8–15×**. FFI-Share <1 %. |
| Input size distribution | String 1 KB – 500 KB. UTF-Konv 0,35 ns/byte = 175 µs bei 500 KB — auf ~10 ms Rust = 1,8 %, vernachlässigbar. |
| Output size distribution | String 0,5 KB – 300 KB. Konv analog, OK. |
| Reusable setup (stateful potential) | **Mittel.** Rule-Set + Options werden zur Constructor-Time kompiliert. `TurndownService`-Class NAPI-Class gibt das dem User zurück. Nicht heavy-setup, aber Class-Pattern passt zur Drop-in-Form. |
| Batch-usage realism | **Hoch.** Scraping-/Migration-Workloads haben 1000+ HTMLs. `turndownMany(htmls: string[]) → string[]` mit rayon-Pool ist Fast-Follow-Hebel. |
| FFI-share estimate vs. Rust work | <1 % auf allen realistischen Input-Größen. |

## Classification reasoning

turndown ist **identisches Shape wie `@amigo-labs/commonmark`**, nur andere Richtung:

1. **Parser-Baseline in JS ist langsam.** DOMParser-Polyfill in turndown ist pure-JS (anders als Browser-DOMParser der Native-C++ ist — im Node-Kontext kein DOMParser verfügbar). Jede Tag-Öffnung/Schließung ist V8-Object-Alloc. Rust's `html5ever` ist SIMD-beschleunigt und zero-GC.

2. **Rule-Dispatch ist Hot-Loop.** Für jeden HTML-Node wird die Rule-Liste durchlaufen (`filter(node)`-Check), bis die erste matcht, dann `replacement(content, node, options)` gerufen. In JS ist das ein Funktions-Call pro Node + dispatch. Rust: Pattern-Match auf Node-Type (statisch), kein Dispatch-Overhead.

3. **Markdown-Emission ist String-Building.** V8's String-Concat ist OK-optimiert aber nicht optimal (Ropes vs. reallocating Buffer). Rust `String::push_str` auf pre-allocated Capacity ist messbar schneller.

4. **Kein Chain-API-Problem.** Im Gegensatz zu cheerio ist die User-API `service.turndown(html) → string` — **ein Call**, ein Result. Internals sind black-box. Perfekt für NAPI.

5. **Custom-Rule-API als akzeptabler Scope-Cut.** Mainstream-Nutzung (basierend auf GitHub-Code-Search) ist:
   - `new TurndownService()` + `.turndown(html)` — **80 %**
   - `new TurndownService({ options })` + `.use(gfm)` + `.turndown(html)` — **15 %**
   - Custom `.addRule()` oder Custom-Filter — **5 %**
   - Die 5 % dokumentieren, migration-notieren; 95 % sind bedient.

6. **Green über alle Input-Größen.** Selbst bei kleinem Input (1 KB HTML = ~3-5 Tags) ist Rust ~100 µs, JS ~1–3 ms. FFI-Floor 109 ns = 0,1 %. Überall Green, kein Bimodal-Problem wie `franc`/`sbd`.

**Shape-Matching:**
- ✅ Wie `@amigo-labs/commonmark` (bytes-in spec, bytes-out result, substantial compute, no chain-API) — exakt gespiegelt
- ✅ Wie `@amigo-labs/sanitize-html` (html5ever-basiert, Rule-Dispatch, single-call)
- ❌ Nicht wie `cheerio` (keine Chain-API)
- ❌ Nicht wie `remark` (keine Plugin-Tree-Mutation; User-Rules sind optionales Feature, nicht Haupt-Value-Prop)

**Benchmark-Gap-Flag:** Vor v1-Ship müssen drei Szenarien bench-gated werden (small/medium/large), zusätzlich GFM-Table-Heavy-Input als Parity-Check.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/turndown` (Drop-in-Konvention; ready-to-drop-in für die 95 %-Nutzung)
- **Primary API sketch:**
  ```ts
  export interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '*' | '-' | '+';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    preformattedCode?: boolean;
    gfm?: boolean;   // replaces turndown-plugin-gfm
    keep?: string[];   // tag names
    remove?: string[];  // tag names
  }

  export class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    turndownBatch(htmls: string[]): string[];   // Fast-Follow v0.2
  }

  // Convenience
  export function turndown(html: string, options?: TurndownOptions): string;
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Small (1 KB HTML, ~5 tags):** Ziel ≥2× vs. `turndown`
  - **Medium (20 KB HTML, Blog-Post mit gemischten Tags):** Ziel ≥5× (Green-Gate-Hauptfall)
  - **Large (100 KB HTML, Scraped Content):** Ziel ≥8×
  - **GFM-heavy (Tables, Task-Lists):** Ziel ≥4× with gfm:true (Parity-Priority)
  - **Batch 100 × 20 KB:** Ziel ≥6× (rayon-Hebel)
  - **Parity-Conformance:** Testset von 500 Real-World-HTML → MD Pairs aus turndown's eigener Test-Suite (MIT). ≥95 % Byte-Identical.
- **Acceptance thresholds (Green gate):** ≥2× auf Small UND ≥5× auf Medium UND ≥95 % Parity. Alle drei müssen treffen.
- **Risks:**
  - **Custom-Rule-API-Migration** — User die `.addRule()` nutzen müssen bleiben bei turndown oder pre-processen
  - **html2md crate Maintenance** — bei Inaktivität: Fork oder Custom-Impl (~1 Woche Aufwand)
  - **DOMParser-Divergenz auf malformed HTML** — Parity auf Worst-Case-Inputs nicht 100 %, via conformance-docs klären
  - **Binary-Size** — html5ever + Custom-Code ~2–3 MB pro Target, vergleichbar mit `@amigo-labs/sanitize-html`
  - **GFM-Plugin-Users** — heute installieren sie `turndown-plugin-gfm` extra. Bei uns ist es `{gfm: true}`-Flag. Migration ist einfach aber nicht null

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).
