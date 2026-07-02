# Candidate review: `remark` / `unified` ecosystem

> **Status:** NO-GO · **Predicted:** 🔴 Red (as a `remark` drop-in) / already solved by `@amigo-labs/commonmark` · **Reviewed:** 2026-04-21

## Verdict

`remark` is **not primarily a Markdown parser** — the parse path (`mdast-util-from-markdown`) is one building block, and we already have it covered by `@amigo-labs/commonmark`. The **real value** of `remark` is the `unified` plugin ecosystem: 100+ `remark-*` transformer plugins, each a JS function that traverses and mutates the mdast AST. This plugin API is the **exact** `langchain` antipattern shape from `BACKLOG.md:39`: "Callback-graph orchestration with unbounded async surface — parity tail never ends." Every plugin is a `(tree, file) => void` function that mutates the AST in JS land. Passing the entire AST across the FFI boundary (hundreds of node objects as JS objects) plus letting the plugin execution happen in JS collapses the Rust gain completely — we would only have the parser part in Rust, and we already have that. A drop-in without plugins would be a duplicate; a drop-in WITH a plugin bridge would be slower than the pure-JS chain.

## JS package

- **npm:** [`remark`](https://www.npmjs.com/package/remark) plus the `unified` ecosystem (`unified`, `mdast-util-from-markdown`, `mdast-util-to-markdown`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-lint-*`, `remark-toc`, `remark-frontmatter`, etc.)
- **Downloads:** `remark` core ~8M/week. The entire unified ecosystem an estimated ~50M/week combined (Q1 2026)
- **Exports / API surface:**
  - `remark()` → unified processor instance
  - `.use(plugin, opts?)` → attach a plugin (chain API)
  - `.process(input)` → `Promise<VFile>` with the output Markdown
  - `.parse(input)` → mdast AST
  - `.stringify(tree)` → Markdown string
  - `.run(tree)` → run the plugin chain on a tree
  - Plugin type: `function plugin(opts?) { return (tree, file) => { /* mutate tree */ } }` — a synchronous or asynchronous transformer that receives the entire mdast AST plus the VFile as JS objects
- **Typical input:** Markdown string 1 KB – 100 KB. Median 5–20 KB (README, docs article)
- **Typical output:** Transformed Markdown string + a VFile with metadata (messages, data)
- **Realistic median use-case:** **Docs-site pipeline** — Astro/Docusaurus/VitePress/Nextra invoke a `remark().use(...).use(...).process(md)` chain per MDX/MD file during the build. Typically 5–20 plugins chained: frontmatter parsing, gfm, TOC generation, syntax highlighting, lint rules, link checking, custom directive handling. Second case: **content-authoring tools** (Obsidian, Notion exporters, CMS pipelines) use similar chains.

## Rust replacement

- **Candidate crate(s):**
  - [`pulldown-cmark`](https://crates.io/crates/pulldown-cmark) — we already use it in `@amigo-labs/commonmark`. Event-based, not AST-based. The wrong shape for mdast plugins.
  - [`markdown-rs`](https://crates.io/crates/markdown) — micromark Rust port, builds an mdast-like AST. **Closer** to the `remark` shape, but:
    - No plugin framework; user transformations would be manual.
    - Parity with the `mdast-util-from-markdown` AST is not 100 %.
    - Active (wooorm / Titus Wormer himself, the same person behind unified/remark), but not yet 1.0-stable.
  - [`comrak`](https://crates.io/crates/comrak) — another Rust CommonMark implementation (Kivikakk), builds an AST. More stable, but not mdast-compatible.
- **Maintenance / license:** `markdown-rs` MIT, active. Supply chain clean.
- **Known gotchas / divergences:**
  - **AST format divergence** — `mdast` is specified as a JSON schema (`@types/mdast`), but every Rust implementation has its own struct layouts. 100 % parity would be ~1–2 weeks of porting effort and fragile against mdast updates.
  - **The plugin system cannot be ported.** Remark plugins are user code. We can offer Rust plugins (pre-baked, no dynamic loading), but that reaches only **a** subset of the 100+ available plugins. Users with `remark-custom-xyz` have no migration path.
  - **The VFile object** — plugins write messages/data into the VFile. Passing this communication channel across FFI means object marshalling in both directions, in a loop.
  - **Async plugins** — `unified` plugins can be async (fetching external data during a transformation). FFI boundary + async + plugin chain = a cascade of problems.

## BACKLOG check

Existing entry in `BACKLOG.md` (section "Parity too expensive"): added 2026-04-21. The review confirms and formalizes it.

Differentiation:
- Versus **`@amigo-labs/commonmark`** (shipped 🟢): that is the parse path in spec-strict form. We have already realized the gain opportunity there. A `remark` port would be a second iteration of the same parser problem.
- Versus `docs/perf-review/marked.md` (NO-GO): same lesson, different rationale — `marked`'s GFM ≠ `pulldown-cmark`'s GFM. `remark` has the same parity sub-problem plus the plugin system.
- Versus `BACKLOG.md:39` **`langchain`** (ruled out, callback graph): structurally identical — remark is essentially "langchain for Markdown transformation". Same decision, same reason.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **The parse part is substantial** (20 KB MD ≈ 2–5 ms `pulldown-cmark`/`markdown-rs`). **But** that is not the lever — we already have it in commonmark. The plugin transformation part = user code in JS, impossible to Rust-ify. |
| Input size distribution | Markdown string 1–100 KB. Fine for FFI transport (UTF conversion ~35 µs at 100 KB, irrelevant vs. the parse compute). |
| Output size distribution | Transformed Markdown is similarly sized. Fine. **If** we returned the AST (for user-side plugin execution): 100+ nodes as JS objects → hundreds of `Object::new` calls, V8 hashmap allocations, `JSON.parse` overhead. That is the **xml lesson** (`docs/post-mortems/xml.md`): "Returning event trees as JS objects means V8 `JSON.parse` on the output dominates." |
| Reusable setup (stateful potential) | Theoretically: "a compiled plugin chain as a Rust object". Only if the plugins are in Rust. Useless for user JS plugins. |
| Batch-usage realism | Irrelevant — the problem is not per-call speed but the plugin-bridge architecture. |
| FFI-share estimate vs. Rust work | Depending on the plugin bridge: 10 %–∞. With AST marshalling on 20 KB MD: ~2–5 ms parse + ~5–10 ms AST marshalling + JS plugin execution = **AST marshalling dominant**. Net result: slower than pure JS. |

## Classification reasoning

Remark has **three layers** of the problem, each fatal on its own:

1. **The parse layer is already solved.** `@amigo-labs/commonmark` covers CommonMark+GFM, with a 3.5×–8.1× speedup against `marked`/`markdown-it`. A `remark-parse` binding would be the same parser again, just packaged differently. No incremental value.

2. **The stringify layer is not the lever either.** `remark-stringify` transforms mdast back to Markdown. That is pure serialization; we already have the `renderFast`/`renderBytesFast` path in `@amigo-labs/commonmark` for that. The round trip parse→transform→stringify is exactly what we could optimize in remark — but without the plugin transformation in between it is not meaningfully different from commonmark's pass-through.

3. **The plugin layer is structurally Black.** Plugins are JS code; they have to run in JS. The only way to call them from Rust would be QuickJS integration (see the `ejs` review: "Needs a JS engine, not feasible"). AST marshalling at the boundary between every plugin is the `xml` trap (archived 2026-04-19, 0.72× vs. `sax` because V8 `JSON.parse` dominated).

**A concrete mini thought experiment:**

- The user writes: `remark().use(gfm).use(toc).use(lint).process(md)`
- Rust-bridge variant:
  1. `md` (string) → Rust: parse → mdast struct (~2 ms Rust work)
  2. mdast struct → V8: hundreds of object allocations (~5–8 ms)
  3. V8: plugin `gfm` traverses and mutates mdast (~500 µs)
  4. V8: plugin `toc` traverses and mutates mdast (~300 µs)
  5. V8: plugin `lint` traverses and mutates mdast (~400 µs)
  6. mdast → Rust: re-marshalling of the mutated tree (~5–8 ms)
  7. Rust: stringify back to MD (~1 ms)
- Total: ~14–20 ms
- Pure-JS remark: ~8–15 ms
- **We would be slower**, not faster. Documented by the xml lesson.

4. **The plugins-in-Rust approach is scope suicide.** We would have to rebuild the 100+ remark plugins. Each of them has its own npm version, its own maintainers, its own versioning. `@amigo-labs/remark-gfm`, `@amigo-labs/remark-toc`, `@amigo-labs/remark-lint`... Portfolio effort explodes, adoption fragments.

**Shape-Matching:**
- 🔁 Like `langchain` (callback graph, unbounded surface)
- 🔁 Like `xml`, archived (AST-over-FFI → V8 JSON.parse dominates)
- 🔁 Like `ejs` (needs a JS engine — the plugins are user JS)
- 🔁 Like `handlebars` (helper callbacks across FFI are expensive)
- ❌ Not like `@amigo-labs/commonmark` (pure parse, no plugin-bridge problem — which is why it is Green)

**Benchmark-gap flag:** No spike needed. The architecture analysis rules out Green, regardless of measurement details. The xml archiving lesson is the direct precedent.

## If GO — proposed port

Not recommended and not sensible. The existing path for `remark` users: use `@amigo-labs/commonmark` for the parse path where AST mutation is not needed, or stay with `remark` for plugin transformations.

## If NO-GO — BACKLOG entry

```markdown
- **remark** / `unified` ecosystem (~8M core, ~50M ecosystem). Core mdast parse is CommonMark+GFM — already covered by `@amigo-labs/commonmark` (🟢 3.5×–8.1× vs. marked/markdown-it). The value-prop of remark is the 100+ `remark-*` transformer plugins, each a JS callback walking the mdast AST. Drop-in without plugins duplicates commonmark; drop-in with plugin-bridge requires AST marshalling across FFI = `xml` antipattern (measured Red, archived), makes us slower than pure JS. Plugin-in-Rust rewrite = scope explosion (100+ packages to replicate). Same lesson as `langchain`, `handlebars`, `ejs`. Full review: `docs/perf-review/remark.md`.
```

Section in `BACKLOG.md`: **Parity too expensive** — the existing entry is replaced by the line above.
