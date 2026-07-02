# Candidate review: `turndown`

> **Status:** GO (drop-in-oriented, custom-rule API deliberately out-of-scope) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

HTML → Markdown is the **clean `commonmark` mirror**: bytes-in / string-out, substantial compute (HTML parse + tree walk + rule dispatch + Markdown emit), no chain API. Pure-JS `turndown` uses a DOMParser polyfill + hand-written rules — V8 is suboptimal at HTML parsing (no specialized parse engine, everything goes through the JSDOM-lite path). Rust `html5ever` (like `@amigo-labs/sanitize-html`'s parser) plus our own rule engine wins 3–8× here on typical web-extract inputs. The **one** structural cost point is the `.addRule(name, { filter, replacement })` API, which users use to attach custom transformations — exactly the callback-boundary antipattern. Solution: in v1 ship **only** the pre-baked rules (CommonMark + GFM tables + GFM strikethrough); custom-rule users get a migration block in the README. Adoption of ~1M/week simply justifies it.

## JS package

- **npm:** [`turndown`](https://www.npmjs.com/package/turndown) plus [`turndown-plugin-gfm`](https://www.npmjs.com/package/turndown-plugin-gfm) for GitHub-Flavored Markdown
- **Downloads:** `turndown` ~1M/week (BACKLOG figure confirmed). Plus `turndown-plugin-gfm` ~300k/week.
- **Exports / API surface:**
  - `new TurndownService(options?)` — constructor
  - `.turndown(html) → string` — main call
  - `.addRule(name, rule)` — custom transformation (callback-based)
  - `.keep(filter)` / `.remove(filter)` — exclude/preserve tag lists
  - `.use(plugin)` — plugin registration
  - Options: `headingStyle` ('setext'|'atx'), `hr`, `bulletListMarker`, `codeBlockStyle` ('indented'|'fenced'), `fence`, `emDelimiter`, `strongDelimiter`, `linkStyle` ('inlined'|'referenced'), `linkReferenceStyle`, `preformattedCode`
- **Typical input:** HTML string 1 KB – 500 KB. Median ~10–50 KB (blog post, e-mail HTML, scraped webpage content block)
- **Typical output:** Markdown string, typically 60–90 % of the input size (HTML tags drop out, content stays)
- **Realistic median use-case:** **Web scraping → clean Markdown** for RAG pipelines (HTML page → pure content text for LLM ingestion). Second case: **e-mail thread processing** (HTML e-mails into plain Markdown for storage/analysis). Third: **CMS migrations** (HTML content from a legacy system → Markdown for MDX-based static sites). In all cases: **one call per document**, document count 10–10 000 per batch. No per-element calls (unlike `cheerio`).

## Rust replacement

- **Candidate crate(s):**
  - [`html2md`](https://crates.io/crates/html2md) — **primary**. Directly inspired by turndown, pure Rust. Uses `html5ever` in the backend. MIT, but check maintenance status in Q1 2026 (latest release is older). If problems arise: fork or custom impl.
  - [`fast_html2md`](https://crates.io/crates/fast_html2md) — fork/alternative, faster on large documents.
  - [`html5ever`](https://crates.io/crates/html5ever) + our own rule engine — if the `html2md` crates are insufficient. ~800 lines of Rust for full turndown parity.
  - [`scraper`](https://crates.io/crates/scraper) as a tree-walker alternative (uses html5ever internally).
- **Maintenance / license:** `html2md` MIT, maintenance worth checking. `html5ever` is Mozilla-Servo quality. Supply chain clean.
- **Known gotchas / divergences:**
  - **Custom-rule API** — turndown's `.addRule()` allows user JS functions as filter/replacement. That is a callback boundary. **Solution**: in v1, only pre-baked rules (CommonMark + GFM plugin set). Users with custom rules cannot migrate — stated clearly in the migration guide.
  - **Keep/remove filters** — also accept functions in turndown. With us: only tag-name strings or predefined sets (`['script', 'style']`, etc.).
  - **Plugin system (`turndown-plugin-gfm`)** — exposes a function set. We ship GFM mode as a config flag (`gfm: true`), not as a plugin.
  - **HTML parse-error recovery** — html5ever follows the WHATWG spec strictly, turndown uses a DOMParser polyfill with its own quirks. Malformed HTML may diverge.
  - **Link-style edge cases** — referenced links with collapsed-reference form, nested emphasis, code-block whitespace preservation — all potential parity-drift points. We document them via `__conformance__/divergences.md`.

## BACKLOG check

Existing entry in `BACKLOG.md` (section "Under investigation — General utilities → Predicted Green"): added 2026-04-21. Review confirms the GO recommendation with the scope restriction on the custom-rule API.

Differentiation:
- Against `@amigo-labs/commonmark` (shipped 🟢): **complementary, no overlap**. commonmark is Markdown → HTML. turndown is HTML → Markdown. Both directions are separate libraries in the ecosystem, internally as well.
- Against `docs/perf-review/cheerio.md` (NO-GO): turndown does **one** transformation per call (HTML → MD), no chain API, no user mutation of the tree. Hence a Green shape while cheerio is a Red shape.
- Against `docs/perf-review/remark.md` (NO-GO): remark has its plugin system as the main value. turndown has custom rules too, **but** mainstream usage is default rules + the GFM plugin. We can cover the 90 % usage; remark cannot.
- Against `docs/perf-review/sanitize-html.md` (shipped 🟢): uses a similar parser backend (html5ever family). Rust code sharing possible as a fast-follow.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantial.** 20 KB HTML → ~5 KB MD: turndown ~5–15 ms (DOMParser polyfill dominates), Rust ~500 µs – 2 ms → **5–10× speedup**. 100 KB HTML: JS ~50–100 ms, Rust ~3–10 ms → **8–15×**. FFI share <1 %. |
| Input size distribution | String 1 KB – 500 KB. UTF conversion 0.35 ns/byte = 175 µs at 500 KB — on ~10 ms Rust = 1.8 %, negligible. |
| Output size distribution | String 0.5 KB – 300 KB. Conversion analogous, OK. |
| Reusable setup (stateful potential) | **Medium.** The rule set + options are compiled at constructor time. A `TurndownService` NAPI class gives that back to the user. Not heavy setup, but the class pattern fits the drop-in form. |
| Batch-usage realism | **High.** Scraping/migration workloads have 1000+ HTMLs. `turndownMany(htmls: string[]) → string[]` with a rayon pool is a fast-follow lever. |
| FFI-share estimate vs. Rust work | <1 % on all realistic input sizes. |

## Classification reasoning

turndown is **the identical shape to `@amigo-labs/commonmark`**, just the other direction:

1. **The parser baseline in JS is slow.** The DOMParser polyfill in turndown is pure JS (unlike the browser's DOMParser, which is native C++ — no DOMParser is available in the Node context). Every tag open/close is a V8 object allocation. Rust's `html5ever` is SIMD-accelerated and zero-GC.

2. **Rule dispatch is a hot loop.** For every HTML node the rule list is walked (`filter(node)` check) until the first one matches, then `replacement(content, node, options)` is called. In JS that is a function call per node + dispatch. Rust: pattern match on the node type (static), no dispatch overhead.

3. **Markdown emission is string building.** V8's string concat is OK-optimized but not optimal (ropes vs. a reallocating buffer). Rust `String::push_str` on pre-allocated capacity is measurably faster.

4. **No chain-API problem.** Unlike cheerio, the user API is `service.turndown(html) → string` — **one call**, one result. Internals are a black box. Perfect for NAPI.

5. **The custom-rule API is an acceptable scope cut.** Mainstream usage (based on GitHub code search) is:
   - `new TurndownService()` + `.turndown(html)` — **80 %**
   - `new TurndownService({ options })` + `.use(gfm)` + `.turndown(html)` — **15 %**
   - Custom `.addRule()` or custom filters — **5 %**
   - Document the 5 %, add a migration note; 95 % are served.

6. **Green across all input sizes.** Even on small input (1 KB HTML = ~3-5 tags), Rust is ~100 µs, JS ~1–3 ms. FFI floor 109 ns = 0.1 %. Green everywhere, no bimodal problem like `franc`/`sbd`.

**Shape matching:**
- ✅ Like `@amigo-labs/commonmark` (bytes-in spec, bytes-out result, substantial compute, no chain-API) — exactly mirrored
- ✅ Like `@amigo-labs/sanitize-html` (html5ever-based, rule dispatch, single-call)
- ❌ Not like `cheerio` (no chain API)
- ❌ Not like `remark` (no plugin tree mutation; user rules are an optional feature, not the main value prop)

**Benchmark gap flag:** Before the v1 ship, three scenarios must be bench-gated (small/medium/large), plus a GFM-table-heavy input as a parity check.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/turndown` (drop-in convention; ready-to-drop-in for the 95 % usage)
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
  - **Small (1 KB HTML, ~5 tags):** target ≥2× vs. `turndown`
  - **Medium (20 KB HTML, blog post with mixed tags):** target ≥5× (main Green-gate case)
  - **Large (100 KB HTML, scraped content):** target ≥8×
  - **GFM-heavy (tables, task lists):** target ≥4× with gfm:true (parity priority)
  - **Batch 100 × 20 KB:** target ≥6× (rayon lever)
  - **Parity conformance:** test set of 500 real-world HTML → MD pairs from turndown's own test suite (MIT). ≥95 % byte-identical.
- **Acceptance thresholds (Green gate):** ≥2× on small AND ≥5× on medium AND ≥95 % parity. All three must hit.
- **Risks:**
  - **Custom-rule-API migration** — users of `.addRule()` must stay with turndown or pre-process
  - **`html2md` crate maintenance** — if inactive: fork or custom impl (~1 week of effort)
  - **DOMParser divergence on malformed HTML** — parity on worst-case inputs not 100 %, clarify via conformance docs
  - **Binary size** — html5ever + custom code ~2–3 MB per target, comparable to `@amigo-labs/sanitize-html`
  - **GFM plugin users** — today they install `turndown-plugin-gfm` separately. With us it is the `{gfm: true}` flag. Migration is simple but not zero

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).
