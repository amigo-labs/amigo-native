# Candidate review: `htmlparser2`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`htmlparser2` is SAX-style: the caller passes callbacks (`onopentag`, `ontext`, …). Every token → callback across the FFI boundary. Event-driven parsers are the anti-shape for NAPI.

## JS package

- **npm:** `htmlparser2`
- **Downloads:** ~62M/week
- **Exports / API surface:** `Parser` with callback handlers, `DomHandler`, `DomUtils`, streaming API
- **Typical input:** HTML stream or document, 1 KB – 5 MB
- **Typical output:** event stream (SAX) or tree (via `DomHandler`)
- **Realistic median use-case:** streaming scraper / cheerio backend, 100–500 KB HTML

## Rust replacement

- **Candidate crate(s):** `html5ever` (tokenizer layer), `html5gum`
- **Maintenance / license:** both active, MIT/Apache
- **Known gotchas / divergences:** `htmlparser2` tolerates XML mode + HTML mode in one parser; no direct Rust equivalent for XML-HTML dual

## BACKLOG check

BACKLOG bundles with `parse5` — confirmed. For `htmlparser2` the callback aspect is harder than the adapter aspect for `parse5`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Tokenize 100 KB ~ 1 ms in JS, Rust ~200 µs → 5× potential |
| Input size distribution | Bytes-in, fine |
| Output size distribution | **Callback per token**: typically ~50K tokens for 100 KB HTML |
| Reusable setup (stateful potential) | Parser instance as a class — possible, but the callback cost stays |
| Batch-usage realism | Streaming defeats batching — same FFI load per chunk |
| FFI-share estimate vs. Rust work | Callbacks dominate: 50K × ~2 µs Rust → JS → Rust = 100 ms — 100× slower than the JS baseline parse |

## Classification reasoning

This is the `handlebars` shape amplified: the parser emits events, the caller decides. Without callbacks `htmlparser2` isn't `htmlparser2`, it's a tree builder — and then we're back at the `parse5` shape (tree materialization). The only sensible API would be: "Rust parses, tokenizes, collects a typed event array in Rust state, returns it at the end as one big `Buffer`/`JsArray`". That would be a different API from `htmlparser2`, with different semantics (no real stream), and only clears the 2× threshold on very large documents (~MB range). For the median use-case (cheerio on scrape responses) the win evaporates.

## If NO-GO — BACKLOG entry

```markdown
- **htmlparser2** (62M). SAX-style callback API is the anti-shape for NAPI — ~2µs per Rust→JS→Rust callback × tens of thousands of tokens per document erases any tokenizer win. A batched "parse-and-return-token-array" API isn't `htmlparser2` anymore.
```

Section in `BACKLOG.md`: **Parity too expensive**
