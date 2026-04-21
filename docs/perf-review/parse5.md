# Candidate review: `parse5`

> **Status:** NO-GO · **Predicted:** 🟡 Yellow (perf) / 🔴 Red (scope) · **Reviewed:** 2026-04-19

## Verdict

`html5ever` can parse HTML fast — but `parse5` isn't just a parser, it's a tree-adapter framework. Parity with `parse5-htmlparser2-tree-adapter`, `parse5-serializer`, error recovery, and WHATWG testsuite behavior is more surface than the perf win justifies.

## JS package

- **npm:** `parse5`
- **Downloads:** ~130M/week
- **Exports / API surface:** `parse`, `parseFragment`, `serialize`, tree adapter (default + htmlparser2-compat), location tracking, custom document types
- **Typical input:** HTML document 5 KB – 5 MB
- **Typical output:** tree (Document/Element/TextNode) over adapter API
- **Realistic median use-case:** web scraper parsing a response (~50 KB), traversing afterwards via `parse5-querystring` / cheerio

## Rust replacement

- **Candidate crate(s):** `html5ever` + `markup5ever`
- **Maintenance / license:** active (Servo team), Apache/MIT
- **Known gotchas / divergences:** `html5ever` produces RcDom; tree traversal across the NAPI boundary would be an FFI crossing per node (`deep-equal` shape). Location tracking different

## BACKLOG check

BACKLOG: *Parity too expensive* (combined with `htmlparser2`) — confirmed.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | HTML parse is CPU-intensive: 100 KB HTML ~2 ms in JS, `html5ever` ~500 µs → 4× potential |
| Input size distribution | Bytes-in, `Buffer` overload → FFI input cheap |
| Output size distribution | **Tree materialization is the killer**: 100 KB HTML → ~10K nodes → every node as a JS object costs NAPI calls for every field |
| Reusable setup (stateful potential) | Low — parser is stateless per call |
| Batch-usage realism | Low (one document per call) |
| FFI-share estimate vs. Rust work | Output dominates from ~1K nodes; the 4× parse win evaporates completely |

## Classification reasoning

The parse step would be a clear win. But no one parses HTML and throws the tree away. Tree materialization over NAPI is exactly the `deep-equal` shape: ~5–10 FFI crossings per node for tag, attributes, children array. At 10K nodes = 50–100K crossings × 109 ns floor = 5–10 ms — more than the JS baseline parse needs end-to-end. Alternative: keep the tree in Rust, access it on-demand (cheerio-wrapper pattern) — but then it isn't a `parse5` drop-in. Second killer: `parse5` has two adapter APIs (default + htmlparser2-compat) + `serialize` + `parseFragment`; that's its own crate ecosystem, not a single package.

## If NO-GO — BACKLOG entry

```markdown
- **parse5** (130M). `html5ever` parses fast, but the tree materialization over NAPI (per-node property FFI) matches the `deep-equal` shape — the parse win is erased by output construction. Plus two adapter APIs + serializer + fragment parser = multiple crates, not one package.
```

Section in `BACKLOG.md`: **Parity too expensive**
