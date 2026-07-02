# Candidate review: `cheerio`

> **Status:** NO-GO · **Predicted:** 🔴 Red (as a drop-in) / ⚫ Black (API shape with mutation chain) · **Reviewed:** 2026-04-21

## Verdict

`cheerio` is the **server-side jQuery** — HTML parsing + CSS selectors + a mutation-chain API. The parse backend (`parse5` or `htmlparser2`) is already listed in `BACKLOG.md:46` as "Parity too expensive". The **real** problem, however, is the chain API: every `$('.item').find('.price').first().text()` is, in JS, a chain of 4 function calls on the **same** DOM tree. In a NAPI-RS port, every chain step would be an FFI crossing **plus** object marshalling of the intermediate results (Cheerio elements as JS wrapper objects around Rust node handles). That is exactly the `xml` antipattern that was archived on 2026-04-19, and the `graphlib` case from the `dagre` review. A drop-in without a redesign = 5–20 FFI crossings per user line of code, cumulatively slower than pure JS. A redesign to bytes-in/bytes-out (`parseAndQuery(html, selector) → Buffer`) would not be a drop-in — it would require a completely different API and would break cheerio's main use case (exploratory scraping pipelines with ad-hoc queries).

## JS package

- **npm:** [`cheerio`](https://www.npmjs.com/package/cheerio)
- **Downloads:** ~10M/week (Q1 2026)
- **Exports / API surface (enormous):**
  - Loader: `load(html, opts) → $`
  - Selection: `$(selector)`, `.find(sel)`, `.filter(sel)`, `.children(sel)`, `.parent(sel)`, `.parents(sel)`, `.siblings(sel)`, `.next()`, `.prev()`, `.first()`, `.last()`, `.eq(n)`, `.closest(sel)`, `.has(sel)`, `.not(sel)`
  - Attributes: `.attr(name, val?)`, `.removeAttr(name)`, `.prop(name, val?)`, `.data(key, val?)`, `.hasClass(cls)`, `.addClass(cls)`, `.removeClass(cls)`, `.toggleClass(cls)`, `.val(val?)`
  - Content: `.text(val?)`, `.html(val?)`, `.contents()`
  - Manipulation: `.append(content)`, `.prepend(content)`, `.appendTo(target)`, `.prependTo(target)`, `.before(content)`, `.after(content)`, `.wrap(wrapper)`, `.unwrap()`, `.replaceWith(content)`, `.remove()`, `.empty()`, `.clone(deep?)`
  - Traversal: `.each(fn)`, `.map(fn)`, `.get()`, `.toArray()`, `.length`
  - Serialization: `.toString()`, `.serialize()`, `.serializeArray()`, `.html()` (on root)
  - Roughly **70+ chain methods in total**.
- **Typical input:** HTML string 1 KB – 10 MB. Scraped web pages typically 50 KB – 500 KB.
- **Typical output:** Depends on the operation — individual strings (`.text()`), arrays (`.map()`), modified HTML (`.html()`), or a Cheerio collection (a wrapper for further chain calls).
- **Realistic median use-case:** **Web-scraping pipeline.** An HTTP response's HTML is loaded, then ad-hoc exploratory queries are executed: `$('h2').map((_, el) => $(el).text())`, `$('.product').each((_, el) => { title: $(el).find('.title').text(), price: $(el).find('.price').text() })`. **Dozens of chain calls per document**, all sequential on the parsed tree. Second case: **HTML transformation for email templating**, **content-sanitization pipelines**, **static-site generators**.

## Rust replacement

- **Candidate crate(s):**
  - [`scraper`](https://crates.io/crates/scraper) — primary. Uses `html5ever` (from the Mozilla Servo team) + CSS selectors via the `selectors` crate. MIT/Apache, active, solid.
  - [`html5ever`](https://crates.io/crates/html5ever) + [`selectors`](https://crates.io/crates/selectors) — the building blocks underneath scraper, in case we want to go below scraper.
  - [`kuchiki`](https://crates.io/crates/kuchiki) — an older tree walker with a jQuery-like API. Unmaintained since 2022, not suitable.
  - [`tl`](https://crates.io/crates/tl) — lighter but less feature-complete.
- **Maintenance / license:** `scraper` MIT/Apache, active. `html5ever` is the Servo engine component, excellent quality. Supply chain clean.
- **Known gotchas / divergences:**
  - **Parity on HTML error recovery** — `parse5` (cheerio's default) follows the WHATWG HTML parse algorithm very strictly. So does `html5ever`, but years of `parse5`-specific behavior in error recovery on malformed HTML are not 1:1.
  - **Mutation semantics** — cheerio's `.append()` mutates the parent tree. Replicating that across FFI means: Rust holds the tree, JS only gets handles to nodes, and every mutation call is an FFI crossing with content-string transport.
  - **CSS selector parity** — cheerio supports CSS3 selectors with some CSS4 features plus jQuery extensions (`:contains(text)`, `:has(sel)`, `:empty`, `:not(sel)`). The `selectors` crate is spec-strict; the jQuery extensions would have to be rebuilt by hand.
  - **Plugin/extension API** — cheerio has `static` methods and users can attach `$.prototype` extensions. That is the JS-callback antipattern all over again.

## BACKLOG check

Existing entry in `BACKLOG.md` (section "Parity too expensive"): added 2026-04-21. The review confirms it with a stronger justification (not just parity — also API shape).

Differentiation:
- Versus `docs/perf-review/parse5.md` (NO-GO): `parse5`/`htmlparser2` are the parse building block. Cheerio is parse **plus** query **plus** mutation. A threefold parity problem.
- Versus `docs/post-mortems/xml.md` (archived): structurally identical — tree-over-FFI, V8 marshalling dominates.
- Versus `docs/perf-review/dagre.md` (GO as `@amigo-labs/graph-layout`): Dagre solves the chain-API problem with a batch spec API (`layout({nodes, edges})` in one crossing). Cheerio could only take an analogous path as a completely new API — which is exactly the point.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Parse: high** (100 KB HTML ≈ 2–5 ms `html5ever`, ~5–10 ms `parse5`). **Query: low-to-medium** (CSS selector on a 1000-node tree: ~10–100 µs). **Mutation: trivial** (attr set: ~1 µs). |
| Input size distribution | Parse call: 1 KB – 10 MB input. Query/mutation: small argument strings (selector, attribute name, content). |
| Output size distribution | Problematic: a **Cheerio collection** as the return value. Every `$('.item')` returns a wrapper object that users pass on to `.text()`, `.attr()`, etc. For the Rust port that would have to be a **Rust handle** living wrapped in JS — 1 FFI crossing to access **any** property. |
| Reusable setup (stateful potential) | **The tree as a NAPI class** (`parseAndLoad(html) → CheerioDoc`) is the only way to avoid re-parsing the tree on every call. That much is a given — but it does not solve the chain-API problem. |
| Batch-usage realism | **Medium-to-high for scraping.** `queryAll(html, selectors: string[]) → string[][]` in one crossing could replace web-page extraction scripts ("extract title, price, image for 1000 product pages" — 1000 parses × 1 batched query). But that is **not** cheerio's API. |
| FFI-share estimate vs. Rust work | With 20+ chain calls per doc: FFI share **dominant**. A typical user script (`$('.product').each(el => { ... $(el).find(...).text() ... })` over 100 products) = 100 × 5+ FFI crossings = 500+ crossings. At 180 ns/crossing = 90 µs of pure FFI for one scrape pass. Rust query work is in the same order of magnitude. **Never Green.** |

## Classification reasoning

Cheerio has **three** structural reasons against the port:

1. **The chain API is unsolvable across FFI.** Every user script is a composition of many small ops. Every op = a crossing. Cumulative overhead dominates. This is the **exact** case documented in the `xml` post-mortem, which led to its archiving. `parseXmlToJson` got faster through **one** bytes-in / JSON-string-out op — but that is not a drop-in for sax streaming / DOM traversal. Cheerio has the problem even more acutely, because users treat the collection as **mutable**.

2. **The parse backend is already flagged.** `parse5`/`htmlparser2` are in "Parity too expensive". Cheerio's parse component would be a re-do of the same work with the same compromises. No incremental gain over a hypothetical parse5 port.

3. **The API surface is enormous, and no non-trivial subset can be selected.** The 70+ chain methods are interdependent. If we only port a part (e.g. query only, no mutation), that is **not** a drop-in — code snippets using `.attr()` or `.append()` break. If we port everything, the porting effort is months.

**Alternative shape (hypothetical):** An `@amigo-labs/html-extract` (not a drop-in) with two methods:

```ts
// One crossing, all results
function extractAll(html: string, queries: Record<string, Selector>): Record<string, string[]>;
// Example:
extractAll(html, {
  titles: { selector: 'h2', output: 'text' },
  prices: { selector: '.price', output: 'text' },
  images: { selector: 'img', output: { attr: 'src' } }
});
```

That is a Green shape (bytes-in / object-out in a single call), but it has no cheerio compatibility and targets a different market (web-scraping pipelines, not server-side DOM manipulation). It would need its own review; not part of this cheerio review. See "If GO" below for a short note.

4. **Ecosystem lock-in is real.** cheerio is deeply integrated into the web-scraping landscape. User code snippets exist on Stack Overflow by the thousands. A drop-in that turns 50 % of the calls Red is catastrophic DX-wise: "works, but is 2× slower than cheerio in your code" — that is negative value.

**Shape-Matching:**
- 🔁 Like `xml`, archived 2026-04-19 (tree traversal over FFI, per-node crossings)
- 🔁 Like `langchain` / `remark` (plugin/chain orchestration, unbounded surface)
- 🔁 Like `handlebars` (helper callbacks across FFI)
- 🔁 Like `parse5`/`htmlparser2` (parity tail, error-recovery details)
- ❌ Not like `dagre` (has a bytes-in/result-out alternative — see there for the chain-vs-spec discussion)
- ❌ Not like `@amigo-labs/commonmark` (single-pass parse + single-pass render, no chain API)

**Benchmark-gap flag:** No spike needed. The architecture analysis is definitive.

## If GO — proposed port

**Not** as a `cheerio` drop-in. Alternative:

A separate, bytes-in/bytes-out HTML-extraction package (`@amigo-labs/html-extract`) can be reviewed as its own candidate — that is a Green shape, but with much smaller adoption (web-scraping-specific, not cheerio's broad use case). If pursued, create a dedicated review (`docs/perf-review/html-extract.md`). **Not part of this review.**

## If NO-GO — BACKLOG entry

```markdown
- **cheerio** (~10M). Server-side jQuery: `parse5`/`htmlparser2` backend (both in "Parity too expensive" above) + 70+ chain-methods + mutation-chain API. Every `.find().attr().text()` chain-step is a separate FFI crossing with object-marshalling of intermediate Cheerio collections — same shape as archived `xml` (`docs/post-mortems/xml.md`, Vec<Object>-over-FFI). Typical scraping scripts do 20+ chains per doc = FFI-share dominant, cumulatively slower than pure JS. Drop-in without the chain API isn't a drop-in. A separate bytes-in/bytes-out `@amigo-labs/html-extract` could be a GO candidate (different market, different API) but out-of-scope here. Full review: `docs/perf-review/cheerio.md`.
```

Section in `BACKLOG.md`: **Parity too expensive** — the existing entry is replaced by the line above.
