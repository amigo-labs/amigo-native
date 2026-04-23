# Divergences — text-splitters

`@amigo-labs/text-splitters` is inspired by
[`@langchain/textsplitters`](https://www.npmjs.com/package/@langchain/textsplitters)
but uses the Rust [`text-splitter`](https://crates.io/crates/text-splitter)
crate as its engine. Algorithms are similar but not byte-identical.

## Scope cuts

### No `lengthFunction` user callback

langchain accepts an arbitrary JS function as the length counter.
Every call back across the FFI boundary — per chunk candidate — is
the documented anti-pattern. Instead we accept an enum via
`lengthMetric`:

- `'chars'` (default)
- `'tiktoken:cl100k_base'` (GPT-3.5/4)
- `'tiktoken:o200k_base'` (GPT-4o)

If you need a custom length function, stay on upstream.

### No custom `separators` array

langchain accepts `separators: string[]` to customise the
recursive-split order. `text-splitter` defines its own semantic
hierarchy (paragraph / sentence / word / grapheme) tuned for RAG.
If you rely on a custom separator list (e.g. splitting on `---`
footer markers), post-process with `String.split` before calling.

### No `createDocuments` / `splitDocuments`

These helpers construct `Document` objects with metadata. The
metadata object travels poorly over FFI (see the `xml` post-mortem).
Do it in JS after `splitText()` returns:

```ts
const chunks = splitText(text, opts)
const docs = chunks.map((text) => ({ pageContent: text, metadata }))
```

### No `HTMLTextSplitter` / `LatexTextSplitter` as separate classes

langchain ships pre-configured variants. We ship only
`RecursiveCharacterTextSplitter` (via `splitText`) and
`MarkdownTextSplitter` (via `splitMarkdown`). HTML / LaTeX input can
be split with `splitText` — the `text-splitter` crate's default
semantic hierarchy is format-agnostic and works adequately on both.

## Behavioural differences

### Chunk boundaries

langchain prefers paragraph > sentence > word > character
boundaries. `text-splitter` uses the same hierarchy but implements
it on unicode segmentation directly. Chunk cut-points may differ on
inputs with ambiguous word boundaries.

### Overlap computation

langchain's overlap is a character-count suffix/prefix on chunks.
`text-splitter` computes overlap by the same sizer as `chunkSize`,
so a `chunkOverlap: 10` with `lengthMetric: 'tiktoken:*'` overlaps
10 tokens, not 10 characters.

### Trimming

Both trim leading/trailing whitespace from chunks by default. No
option to disable.
