# Candidate review: `cheerio`

> **Status:** NO-GO · **Predicted:** 🔴 Red (als Drop-in) / ⚫ Black (API-Shape mit Mutation-Chain) · **Reviewed:** 2026-04-21

## Verdict

`cheerio` ist der **server-side jQuery** — Parse-HTML + CSS-Selektoren + Mutation-Chain-API. Das Parse-Backend (`parse5` oder `htmlparser2`) ist bereits in `BACKLOG.md:46` als "Parity too expensive" gelistet. Das **eigentliche** Problem ist aber die Chain-API: jedes `$('.item').find('.price').first().text()` ist in JS eine Kette von 4 Function-Calls auf **demselben** DOM-Tree. In einem NAPI-RS-Port wäre jede Kette-Step ein FFI-Crossing **plus** Object-Marshalling der Zwischen-Ergebnisse (Cheerio-Elemente als JS-Wrapper-Objekte um Rust-Node-Handles). Das ist exakt der `xml`-Antipattern, der 2026-04-19 archiviert wurde, und der `graphlib`-Fall aus dem `dagre`-Review. Drop-in ohne Redesign = 5–20 FFI-Crossings pro User-Line-of-Code, kumulativ schneller-pure-JS. Redesign auf Bytes-in/Bytes-out (`parseAndQuery(html, selector) → Buffer`) wäre kein Drop-in — es bräuchte eine völlig andere API und würde Cheerio's Haupt-Use-Case (explorative Scraping-Pipelines mit ad-hoc-Queries) brechen.

## JS package

- **npm:** [`cheerio`](https://www.npmjs.com/package/cheerio)
- **Downloads:** ~10M/Woche (Q1 2026)
- **Exports / API surface (enorm):**
  - Loader: `load(html, opts) → $`
  - Selection: `$(selector)`, `.find(sel)`, `.filter(sel)`, `.children(sel)`, `.parent(sel)`, `.parents(sel)`, `.siblings(sel)`, `.next()`, `.prev()`, `.first()`, `.last()`, `.eq(n)`, `.closest(sel)`, `.has(sel)`, `.not(sel)`
  - Attributes: `.attr(name, val?)`, `.removeAttr(name)`, `.prop(name, val?)`, `.data(key, val?)`, `.hasClass(cls)`, `.addClass(cls)`, `.removeClass(cls)`, `.toggleClass(cls)`, `.val(val?)`
  - Content: `.text(val?)`, `.html(val?)`, `.contents()`
  - Manipulation: `.append(content)`, `.prepend(content)`, `.appendTo(target)`, `.prependTo(target)`, `.before(content)`, `.after(content)`, `.wrap(wrapper)`, `.unwrap()`, `.replaceWith(content)`, `.remove()`, `.empty()`, `.clone(deep?)`
  - Traversal: `.each(fn)`, `.map(fn)`, `.get()`, `.toArray()`, `.length`
  - Serialization: `.toString()`, `.serialize()`, `.serializeArray()`, `.html()` (auf root)
  - Ca. **70+ Chain-Methoden total**.
- **Typical input:** HTML-String 1 KB – 10 MB. Scraped Webpages typisch 50 KB – 500 KB.
- **Typical output:** Hängt von Operation ab — einzelne Strings (`.text()`), Arrays (`.map()`), modifiziertes HTML (`.html()`), oder Cheerio-Collection (Wrapper für weitere Chain-Calls).
- **Realistic median use-case:** **Web-Scraping-Pipeline.** Ein HTTP-Response-HTML wird geladen, dann ad-hoc-explorative Queries ausgeführt: `$('h2').map((_, el) => $(el).text())`, `$('.product').each((_, el) => { title: $(el).find('.title').text(), price: $(el).find('.price').text() })`. **Dutzende von Chain-Calls pro Dokument**, alle sequenziell auf dem geparsed Tree. Zweiter Case: **HTML-Transformation für E-Mail-Templating**, **Content-Sanitization-Pipelines**, **Static-Site-Generators**.

## Rust replacement

- **Candidate crate(s):**
  - [`scraper`](https://crates.io/crates/scraper) — primär. Nutzt `html5ever` (von Mozilla-Servo-Team) + CSS-Selektoren via `selectors` crate. MIT/Apache, aktiv, solide.
  - [`html5ever`](https://crates.io/crates/html5ever) + [`selectors`](https://crates.io/crates/selectors) — die Bausteine unter scraper, falls wir unter-scrapper gehen wollen.
  - [`kuchiki`](https://crates.io/crates/kuchiki) — älterer Tree-Walker mit jQuery-ähnlicher API. Unmaintained seit 2022, nicht geeignet.
  - [`tl`](https://crates.io/crates/tl) — leichter aber weniger feature-complete.
- **Maintenance / license:** `scraper` MIT/Apache, aktiv. `html5ever` ist die Servo-Engine-Komponente, exzellente Qualität. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Parity auf HTML-Error-Recovery** — `parse5` (cheerio default) folgt WHATWG-HTML-Parse-Algorithm sehr strikt. `html5ever` auch, aber jahrelange `parse5`-Spezifika in Error-Recovery auf malformed HTML sind nicht 1:1.
  - **Mutation-Semantik** — cheerio's `.append()` mutiert den Parent-Tree. Das über FFI zu replizieren bedeutet: Rust hält den Tree, JS kriegt nur Handles auf Nodes, jeder Mutation-Call ist ein FFI-Crossing mit Content-String-Transport.
  - **CSS-Selector-Parity** — cheerio unterstützt CSS3 Selektoren mit einigen CSS4-Features plus jQuery-Extensions (`:contains(text)`, `:has(sel)`, `:empty`, `:not(sel)`). `selectors` crate ist spec-strikt; jQuery-Extensions müssten manuell nachgebaut werden.
  - **Plugin/Extension-API** — cheerio hat `static`-Methoden und User können `$.prototype`-Extensions hängen. Das ist dann wieder der JS-Callback-Antipattern.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "Parity too expensive"): ergänzt 2026-04-21. Review bestätigt mit stärkerer Begründung (nicht nur Parity — auch API-Shape).

Abgrenzung:
- Gegen `docs/perf-review/parse5.md` (NO-GO): `parse5`/`htmlparser2` sind der Parse-Baustein. Cheerio ist Parse **plus** Query **plus** Mutation. Dreifaches Parity-Problem.
- Gegen `docs/post-mortems/xml.md` (archived): strukturell-identisch — Tree-over-FFI, V8-Marshalling dominiert.
- Gegen `docs/perf-review/dagre.md` (GO als `@amigo-labs/graph-layout`): Dagre löst das Chain-API-Problem durch Batch-Spec-API (`layout({nodes, edges})` in ein Crossing). Cheerio hätte einen analogen Weg nur als völlig neue API — was der Punkt ist.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Parse: hoch** (100 KB HTML ≈ 2–5 ms `html5ever`, ~5–10 ms `parse5`). **Query: niedrig-mittel** (CSS-Selector auf 1000-Node-Tree: ~10–100 µs). **Mutation: trivial** (attr-set: ~1 µs). |
| Input size distribution | Parse-Call: 1 KB – 10 MB Input. Query/Mutation: kleine Argument-Strings (Selector, Attribute-Name, Content). |
| Output size distribution | Problematisch: **Cheerio-Collection** als Return-Wert. Jedes `$('.item')` gibt eine Wrapper-Object zurück, das die User an `.text()`, `.attr()`, etc. weiterreichen. Für den Rust-Port müsste das ein **Rust-Handle** sein, das in JS wrapped lebt — 1 FFI-Crossing zum Zugriff auf **irgendeine** Eigenschaft. |
| Reusable setup (stateful potential) | **Tree als NAPI-Class** (`parseAndLoad(html) → CheerioDoc`) ist der einzige Weg, den geparsed Tree nicht pro-Call neu zu parsen. Das ist gegeben — aber es löst nicht das Chain-API-Problem. |
| Batch-usage realism | **Mittel-hoch für Scraping.** `queryAll(html, selectors: string[]) → string[][]` ein Crossing könnte Webseiten-Extract-Scripts ersetzen ("extract title, price, image for 1000 product pages" — 1000 parses × 1 batched query). Aber das ist **nicht** cheerio's API. |
| FFI-share estimate vs. Rust work | Bei 20+ Chain-Calls pro Doc: FFI-Share **dominant**. Ein typischer User-Script (`$('.product').each(el => { ... $(el).find(...).text() ... })` auf 100 Products) = 100 × 5+ FFI-Crossings = 500+ Crossings. Bei 180 ns/Crossing = 90 µs pure FFI auf einen Scrape-Pass. Rust-Query-Work gleich-Größenordnung. **Nie Green.** |

## Classification reasoning

Cheerio hat **drei** strukturelle Gründe gegen den Port:

1. **Chain-API ist unlöslich über FFI.** Jedes User-Script ist eine Komposition vieler kleiner Ops. Jede Op = Crossing. Cumulative Overhead dominiert. Das ist der **exakte** Fall der im `xml`-Post-Mortem dokumentiert wurde und zur Archivierung führte. `parseXmlToJson` wurde schneller durch **eine** Bytes-in / JSON-String-out Op — aber das ist kein Drop-in für sax-streaming/DOM-traversal. Cheerio hat das Problem noch schärfer, weil Users die Collection als **mutable** behandeln.

2. **Parse-Backend ist bereits flagged.** `parse5`/`htmlparser2` sind in "Parity too expensive". Cheerio's parse-Komponente wäre Re-do derselben Arbeit mit denselben Kompromissen. Kein inkrementeller Gewinn über einen hypothetischen parse5-Port.

3. **API-Surface ist enorm und nicht triviale Teilmenge wählbar.** Die 70+ Chain-Methoden sind inter-abhängig. Wenn wir nur einen Teil porten (z.B. nur Query, keine Mutation), ist das **kein** Drop-in — Code-Schnipsel die `.attr()` oder `.append()` nutzen brechen. Wenn wir alles porten, ist der Port-Aufwand Monate.

**Alternative Shape (hypothetisch):** Ein `@amigo-labs/html-extract` (kein Drop-in) mit zwei Methoden:

```ts
// Ein Crossing, alle Results
function extractAll(html: string, queries: Record<string, Selector>): Record<string, string[]>;
// Example:
extractAll(html, {
  titles: { selector: 'h2', output: 'text' },
  prices: { selector: '.price', output: 'text' },
  images: { selector: 'img', output: { attr: 'src' } }
});
```

Das ist Green-Shape (Bytes-in / Object-out in einem Call), hat aber keine Cheerio-Kompatibilität und trifft einen anderen Markt (Web-Scraping-Pipelines, nicht server-side-DOM-Manipulation). Würde eigenes Review brauchen; nicht Teil dieses Cheerio-Reviews. Siehe "If GO" unten für eine kurze Notiz.

4. **Ökosystem-Lock-in ist real.** cheerio ist tief in der Web-Scraping-Landschaft integriert. User-Code-Schnipsel finden sich auf Stack Overflow zu tausenden. Ein Drop-in der 50 % der Calls Red macht ist DX-mäßig katastrophal: "funktioniert, aber ist 2× langsamer als cheerio in deinem Code" — das ist negative-value.

**Shape-Matching:**
- 🔁 Wie `xml` archived 2026-04-19 (Tree-traversal über FFI, pro-Node-Crossings)
- 🔁 Wie `langchain` / `remark` (Plugin/Chain-Orchestration, Unbounded-Surface)
- 🔁 Wie `handlebars` (helper-callbacks across FFI)
- 🔁 Wie `parse5`/`htmlparser2` (Parity-Tail, Error-Recovery-Details)
- ❌ Nicht wie `dagre` (hat Bytes-in/Result-out Alternative — siehe dort für Chain-vs-Spec-Diskussion)
- ❌ Nicht wie `@amigo-labs/commonmark` (single-pass parse + single-pass render, kein Chain-API)

**Benchmark-Gap-Flag:** Kein Spike nötig. Architektur-Analyse ist definitiv.

## If GO — proposed port

**Nicht** als `cheerio`-Drop-in. Alternative:

Ein separates, bytes-in/bytes-out HTML-Extract-Paket (`@amigo-labs/html-extract`) kann als eigener Kandidat reviewed werden — das ist ein Green-Shape, aber mit viel kleinerer Adoption (Web-Scraping-specific, nicht cheerio-broad-use-case). Wenn das verfolgt wird, eigenes Review anlegen (`docs/perf-review/html-extract.md`). **Nicht Teil dieses Reviews.**

## If NO-GO — BACKLOG entry

```markdown
- **cheerio** (~10M). Server-side jQuery: `parse5`/`htmlparser2` backend (both in "Parity too expensive" above) + 70+ chain-methods + mutation-chain API. Every `.find().attr().text()` chain-step is a separate FFI crossing with object-marshalling of intermediate Cheerio collections — same shape as archived `xml` (`docs/post-mortems/xml.md`, Vec<Object>-over-FFI). Typical scraping scripts do 20+ chains per doc = FFI-share dominant, cumulatively slower than pure JS. Drop-in without the chain API isn't a drop-in. A separate bytes-in/bytes-out `@amigo-labs/html-extract` could be a GO candidate (different market, different API) but out-of-scope here. Full review: `docs/perf-review/cheerio.md`.
```

Section in `BACKLOG.md`: **Parity too expensive** — bestehender Eintrag wird durch die obige Zeile ersetzt.
