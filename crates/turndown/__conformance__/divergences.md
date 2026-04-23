# Divergences — turndown

`@amigo-labs/turndown` is a **subset-parity** port of
[`turndown`](https://www.npmjs.com/package/turndown). We target the
95% of usage covered by CommonMark + GFM defaults; the
callback-driven extensibility surface is not exposed.

## Scope cuts

### No `.addRule()` / custom JS filters

turndown's `.addRule(name, { filter, replacement })` lets the caller
hook in JS functions that run per matching node. Every visit is a
FFI crossing; see `docs/perf-review/turndown.md`. Power users stay
on upstream `turndown`.

### No `.use(plugin)` registration surface

`turndown-plugin-gfm` behaviour is provided by `{ gfm: true }`. Other
plugins need to be reimplemented in Rust.

### No `keep`/`remove` by filter function

We accept `keep: string[]` / `remove: string[]` (tag-name lists) only.
Custom filter functions would mean per-call callbacks.

## Byte-level differences from upstream

### Text-node escaping

turndown escapes `_`, `*`, `#`, `[`, `]`, etc. inside text nodes when
they would otherwise form Markdown constructs. v0.1 takes a
conservative pass-through approach; rare word content with bare
asterisks may render as emphasis. Fast-follow fix.

### Inline vs. block whitespace around emphasis

turndown trims whitespace inside `<strong>`/`<em>` and moves it
outside: `<strong> x </strong>` → `** x **` → `** x **`. We keep
exact inner content: `<strong> x </strong>` → `** x **`. Matches in
practice; differs on pathological whitespace.

### Nested list indentation

Both emit 2-space indentation per level. Edge cases with `<li>`
containing a `<p>` differ in blank-line handling; output is still
valid Markdown.

### Autolinks

`<a href="https://x">https://x</a>` renders as `[https://x](https://x)`
for us. turndown can use the autolink form `<https://x>`
(implementation-defined). Both are valid Markdown.

### Image-inside-link

We emit `[![alt](src)](href)`; turndown does the same. Byte-identical
in testing.

### Table-without-thead

GFM tables require a header row. If the input HTML has `<tbody>` but
no `<thead>`, we promote the first row as header. turndown does the
same.

## What we do that upstream doesn't

- **`turndownBatch(htmls)`** — single FFI crossing for N documents.
  Upstream's JS equivalent is just `htmls.map(t => svc.turndown(t))`;
  ours amortises the V8 boundary cost.
