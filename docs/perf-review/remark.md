# Candidate review: `remark` / `unified` ecosystem

> **Status:** NO-GO · **Predicted:** 🔴 Red (als `remark`-Drop-in) / bereits gelöst durch `@amigo-labs/commonmark` · **Reviewed:** 2026-04-21

## Verdict

`remark` ist **nicht hauptsächlich ein Markdown-Parser** — der Parse-Pfad (`mdast-util-from-markdown`) ist ein Baustein, und den haben wir bereits durch `@amigo-labs/commonmark`. Der **eigentliche Wert** von `remark` ist das `unified`-Plugin-Ökosystem: 100+ `remark-*` Transformer-Plugins, jedes eine JS-Funktion die den mdast-AST traversiert und mutiert. Diese Plugin-API ist der **genaue** `langchain`-Antipattern-Shape aus `BACKLOG.md:39`: "Callback-graph orchestration with unbounded async surface — parity tail never ends." Jedes Plugin ist eine `(tree, file) => void`-Funktion, die den AST in JS-Land mutiert. Den gesamten AST über die FFI-Grenze zu reichen (hunderte von Node-Objekten als JS-Objekte) plus die Plugin-Ausführung in JS stattfinden zu lassen, kollabiert den Rust-Gewinn komplett — wir hätten nur den Parser-Teil in Rust, und den haben wir schon. Drop-in ohne Plugins wäre Duplikat, Drop-in MIT Plugin-Bridge wäre langsamer als die pure-JS-Kette.

## JS package

- **npm:** [`remark`](https://www.npmjs.com/package/remark) plus das `unified`-Ecosystem (`unified`, `mdast-util-from-markdown`, `mdast-util-to-markdown`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-lint-*`, `remark-toc`, `remark-frontmatter`, etc.)
- **Downloads:** `remark` core ~8M/Woche. Gesamtes unified-Ecosystem geschätzt ~50M/Woche kombiniert (Q1 2026)
- **Exports / API surface:**
  - `remark()` → unified-Processor-Instanz
  - `.use(plugin, opts?)` → Plugin hängen (Chain-API)
  - `.process(input)` → `Promise<VFile>` mit Output-Markdown
  - `.parse(input)` → mdast-AST
  - `.stringify(tree)` → Markdown-String
  - `.run(tree)` → Plugin-Chain auf Tree ausführen
  - Plugin-Typ: `function plugin(opts?) { return (tree, file) => { /* mutate tree */ } }` — synchroner oder asynchroner Transformer, kriegt den gesamten mdast-AST plus VFile als JS-Objekte
- **Typical input:** Markdown-String 1 KB – 100 KB. Median 5–20 KB (README, Docs-Artikel)
- **Typical output:** Transformed Markdown-String + VFile mit Metadata (messages, data)
- **Realistic median use-case:** **Docs-Site-Pipeline** — Astro/Docusaurus/VitePress/Nextra rufen eine `remark().use(...).use(...).process(md)` Kette pro MDX/MD-Datei im Build. Typisch 5–20 Plugins gechained: frontmatter-parse, gfm, toc-generation, syntax-highlight, lint-rules, link-check, custom-directive-handling. Zweiter Case: **Content-Authoring-Tools** (Obsidian, Notion-Exporter, CMS-Pipelines) benutzen ähnliche Ketten.

## Rust replacement

- **Candidate crate(s):**
  - [`pulldown-cmark`](https://crates.io/crates/pulldown-cmark) — wir nutzen es bereits in `@amigo-labs/commonmark`. Event-basiert, nicht AST-basiert. Falsche Shape für mdast-Plugins.
  - [`markdown-rs`](https://crates.io/crates/markdown) — micromark-Rust-Port, baut mdast-ähnlichen AST. **Näher** am `remark`-Shape, aber:
    - Kein Plugin-Framework; User-Transformationen wären manuell.
    - Parity mit `mdast-util-from-markdown`-AST nicht 100 %.
    - Aktiv (wooorm / Titus Wormer selbst, gleiche Person hinter unified/remark), aber noch nicht 1.0-stabil.
  - [`comrak`](https://crates.io/crates/comrak) — andere Rust-CommonMark-Impl (Kivikakk), baut AST. Stabiler, aber nicht mdast-kompatibel.
- **Maintenance / license:** `markdown-rs` MIT, aktiv. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **AST-Format-Divergenz** — `mdast` ist in JSON-Schema spezifiziert (`@types/mdast`), aber jede Rust-Impl hat eigene Struct-Layouts. 100 %-Parität wäre Port-Aufwand ~1–2 Wochen und fragil gegen mdast-Updates.
  - **Plugin-System kann nicht portiert werden.** Remark-Plugins sind User-Code. Wir können Rust-Plugins anbieten (pre-baked, keine dynamic Loading), aber das erreicht **eine** Teilmenge der 100+ verfügbaren Plugins. User mit `remark-custom-xyz` haben keine Migration.
  - **VFile-Objekt** — Plugins schreiben Messages/Data in die VFile. Diese Communication-Channel über FFI reichen bedeutet Object-Marshalling in beide Richtungen, in einer Loop.
  - **Async-Plugins** — `unified`-Plugins können async sein (fetch external data während Transformation). FFI-Grenze + async + Plugin-Chain = Problem-Kaskade.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "Parity too expensive"): ergänzt 2026-04-21. Review bestätigt und formalisiert.

Abgrenzung:
- Gegen **`@amigo-labs/commonmark`** (shipped 🟢): das ist der Parse-Pfad in spec-strikter Form. Wir haben die Gewinnmöglichkeit dort bereits realisiert. Ein `remark`-Port wäre zweite Iteration desselben Parser-Problems.
- Gegen `docs/perf-review/marked.md` (NO-GO): gleiche Lehre, andere Begründung — `marked`'s GFM ≠ `pulldown-cmark`'s GFM. `remark` hat denselben Parity-Unter-Problem plus das Plugin-System.
- Gegen `BACKLOG.md:39` **`langchain`** (Ruled out, Callback-Graph): strukturell-identisch — remark ist im Wesentlichen "langchain für Markdown-Transformation". Gleiche Entscheidung, gleicher Grund.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Parse-Teil ist substantiell** (20 KB MD ≈ 2–5 ms `pulldown-cmark`/`markdown-rs`). **Aber** das ist nicht der Hebel — den haben wir bereits in commonmark. Plugin-Transformations-Teil = User-Code in JS, unmöglich zu Rust-ifizieren. |
| Input size distribution | Markdown-String 1–100 KB. OK für FFI-Transport (UTF-Konv ~35 µs bei 100 KB, irrelevant vs. Parse-Compute). |
| Output size distribution | Transformed-Markdown ähnlich groß. OK. **Wenn** wir AST zurückgeben würden (für User-Side-Plugin-Ausführung): 100+ Nodes als JS-Objekte → hunderte von `Object::new`-Calls, V8-Hashmap-Allokationen, `JSON.parse`-Overhead. Das ist die **xml-Lehre** (`docs/post-mortems/xml.md`): "Returning event trees as JS objects means V8 `JSON.parse` on the output dominates." |
| Reusable setup (stateful potential) | Theoretisch: "kompilierte Plugin-Chain als Rust-Object". Nur wenn Plugins in Rust. Für User-JS-Plugins nutzlos. |
| Batch-usage realism | Irrelevant — Problem ist nicht per-call Speed, sondern Plugin-Bridge-Architektur. |
| FFI-share estimate vs. Rust work | Je nach Plugin-Bridge: 10 %–∞. Bei AST-Marshalling auf 20 KB MD: ~2–5 ms Parse + ~5–10 ms AST-Marshalling + JS-Plugin-Execution = **AST-Marshalling dominant**. Nettoergebnis: langsamer als pure-JS. |

## Classification reasoning

Remark hat **drei Ebenen** des Problems, jede für sich tödlich:

1. **Parse-Ebene ist bereits gelöst.** `@amigo-labs/commonmark` deckt CommonMark+GFM ab, gegen `marked`/`markdown-it` mit 3,5×–8,1× Speedup. Ein `remark-parse`-Binding wäre derselbe Parser nochmal, nur anders verpackt. Keine inkrementeller Value.

2. **Stringify-Ebene ist auch nicht der Hebel.** `remark-stringify` transformiert mdast zurück zu Markdown. Das ist pure Serialization, wir haben dafür bereits den `renderFast`/`renderBytesFast`-Pfad in `@amigo-labs/commonmark`. Der Runde-Trip Parse→Transform→Stringify ist in remark genau das was wir optimieren können — aber ohne Plugin-Transformation dazwischen nicht meaningful anders als commonmark's Pass-through.

3. **Plugin-Ebene ist strukturell-Black.** Plugins sind JS-Code, sie müssen in JS laufen. Die einzige Art sie in Rust zu rufen wäre QuickJS-Integration (siehe `ejs`-Review: "Needs a JS engine, not feasible"). AST-Marshalling an der Grenze zwischen jedem Plugin ist die `xml`-Falle (archived 2026-04-19, 0,72× `sax` weil V8 `JSON.parse` dominierte).

**Konkreter Mini-Thought-Experiment:**

- User schreibt: `remark().use(gfm).use(toc).use(lint).process(md)`
- Rust-Bridge-Variante:
  1. `md` (String) → Rust: parse → mdast-Struct (~2 ms Rust-Work)
  2. mdast-Struct → V8: hunderte Object-Allokationen (~5–8 ms)
  3. V8: plugin `gfm` traversiert und mutiert mdast (~500 µs)
  4. V8: plugin `toc` traversiert und mutiert mdast (~300 µs)
  5. V8: plugin `lint` traversiert und mutiert mdast (~400 µs)
  6. mdast → Rust: re-marshalling des mutierten Trees (~5–8 ms)
  7. Rust: stringify zurück zu MD (~1 ms)
- Total: ~14–20 ms
- Pure-JS remark: ~8–15 ms
- **Wir wären langsamer**, nicht schneller. Dokumentiert durch die xml-Lehre.

4. **Plugin-in-Rust-Ansatz ist Scope-Suizid.** Wir müssten die 100+ remark-Plugins nachbauen. Jedes davon hat eine eigene npm-Version, eigene Maintainer, eigene Versionierung. `@amigo-labs/remark-gfm`, `@amigo-labs/remark-toc`, `@amigo-labs/remark-lint`... Portfolio-Aufwand explodiert, Adoption fragmentiert.

**Shape-Matching:**
- 🔁 Wie `langchain` (Callback-Graph, unbounded surface)
- 🔁 Wie `xml` archived (AST-over-FFI → V8 JSON.parse dominiert)
- 🔁 Wie `ejs` (Needs a JS engine — Plugins sind User-JS)
- 🔁 Wie `handlebars` (helper-callbacks across FFI expensive)
- ❌ Nicht wie `@amigo-labs/commonmark` (pure parse, no plugin-bridge-problem — deswegen Green)

**Benchmark-Gap-Flag:** Kein Spike nötig. Die Architektur-Analyse schließt Green aus, unabhängig von Mess-Details. Die xml-Archivierungs-Lehre ist der direkte Präzedenzfall.

## If GO — proposed port

Nicht empfohlen und nicht sinnvoll. Bestehender Weg für `remark`-User: nutze `@amigo-labs/commonmark` für den Parse-Pfad wo eine AST-Mutation nicht nötig ist, oder bleibe bei `remark` für Plugin-Transformationen.

## If NO-GO — BACKLOG entry

```markdown
- **remark** / `unified` ecosystem (~8M core, ~50M ecosystem). Core mdast parse is CommonMark+GFM — already covered by `@amigo-labs/commonmark` (🟢 3.5×–8.1× vs. marked/markdown-it). The value-prop of remark is the 100+ `remark-*` transformer plugins, each a JS callback walking the mdast AST. Drop-in without plugins duplicates commonmark; drop-in with plugin-bridge requires AST marshalling across FFI = `xml` antipattern (measured Red, archived), makes us slower than pure JS. Plugin-in-Rust rewrite = scope explosion (100+ packages to replicate). Same lesson as `langchain`, `handlebars`, `ejs`. Full review: `docs/perf-review/remark.md`.
```

Section in `BACKLOG.md`: **Parity too expensive** — bestehender Eintrag wird durch die obige Zeile ersetzt.
