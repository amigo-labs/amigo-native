# Candidate review: `jsdom`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

`jsdom` is a complete browser DOM + Fetch + XHR + Worker + Canvas + CSSOM implementation in JS. No Rust crate exists for this, and the surface is structurally incompatible with NAPI classes: everything is object-graph traversal with JS callback semantics.

## JS package

- **npm:** `jsdom`
- **Downloads:** ~76M/week
- **Exports / API surface:** `JSDOM`, `window`, `document`, complete DOM Level 4 + HTML spec surface, `ResourceLoader`, `VirtualConsole`, partial web APIs (Fetch, XHR, Canvas 2D via optional `canvas`, web workers stub)
- **Typical input:** HTML document + optional resource loader
- **Typical output:** `window`/`document` object with full DOM API access
- **Realistic median use-case:** test environment (`vitest`/`jest` with `jsdom`), SSR helper for libraries, scraping with JS execution

## Rust replacement

- **Candidate crate(s):** none. `html5ever` parses, but no Rust crate implements `window`, event loop, DOM mutation APIs, CSSOM, computed styles
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** `jsdom` needs a JS engine (V8) for script execution — even if the DOM were in Rust, everything would have to go back to V8

## BACKLOG check

BACKLOG: *Scope too large* — confirmed, classification upgraded to Black (structurally incompatible).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Every attribute, every selector, every event dispatch = FFI crossing |
| Input size distribution | Irrelevant — shape is fundamentally incompatible |
| Output size distribution | DOM tree with tens of thousands of properties |
| Reusable setup (stateful potential) | High, but the caller code invokes `document.querySelector` → `.innerHTML = …` in hot loops |
| Batch-usage realism | Zero |
| FFI-share estimate vs. Rust work | 100% FFI for typical test workloads |

## Classification reasoning

`jsdom` users call `document.querySelector('div').textContent = 'x'` — that's three property accesses, one setter invocation, one DOM mutation observer callback. Every single one of those steps would be an FFI crossing. Even if the entire DOM core were in Rust, every test case would trigger thousands of FFI crossings per millisecond. That's the lookup-workload Black scenario from the classification table. On top of that: script execution (a large part of `jsdom`) needs V8; Rust can't provide that. Permanent NO-GO.

## If NO-GO — BACKLOG entry

```markdown
- **jsdom** (76M). Browser-API surface is gigantic AND its usage shape is pure lookup/mutation workload on an object graph — the Black-classification anti-shape. No amount of Rust DOM implementation can outperform V8 on `element.textContent = x`. Permanent NO-GO.
```

Section in `BACKLOG.md`: **Scope too large**
