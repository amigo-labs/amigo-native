# @amigo-labs/text-splitters

> RAG text splitters — `RecursiveCharacterTextSplitter` and
> `MarkdownTextSplitter` equivalents, with tiktoken-aware length as
> a built-in length metric (no JS callback round-trips).
>
> Backed by [`text-splitter`](https://crates.io/crates/text-splitter)
> for the segmentation engine and
> [`tiktoken-rs`](https://crates.io/crates/tiktoken-rs) for BPE
> encoding.

## Install

```bash
pnpm add @amigo-labs/text-splitters
```

## Usage

```js
import {
  splitText,
  splitTextBatch,
  splitMarkdown,
  countTokens,
} from '@amigo-labs/text-splitters'

splitText('your long document…', { chunkSize: 1000, chunkOverlap: 200 })

// Token-aware chunking (for LLM context budgeting):
splitText(doc, {
  chunkSize: 512,
  chunkOverlap: 64,
  lengthMetric: 'tiktoken:cl100k_base',
})

// Markdown-aware (keeps headings/code-blocks intact when they fit):
splitMarkdown(doc, { chunkSize: 1000 })

// Batch one FFI crossing for N documents:
splitTextBatch([doc1, doc2, doc3], { chunkSize: 1000 })

countTokens('hello world', 'tiktoken:cl100k_base')
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { splitText, splitMarkdown, countChars } from '@amigo-labs/text-splitters'
```

**Token metrics are Node-only.** `countTokens` and `lengthMetric: "tiktoken:*"` throw in the WASM build — the tiktoken-rs BPE tables (~1.5 MB) don't ship on wasm32. Use `countChars` / character-based metrics in the browser.

## Options

```ts
interface SplitterOptions {
  chunkSize?: number       // default 1000
  chunkOverlap?: number    // default 0
  lengthMetric?:
    | 'chars'                    // default
    | 'tiktoken:cl100k_base'     // GPT-3.5 / GPT-4
    | 'tiktoken:o200k_base'      // GPT-4o
}
```

## Scope

- `RecursiveCharacterTextSplitter` via `splitText`.
- `MarkdownTextSplitter` via `splitMarkdown` (preserves headings,
  code-blocks, list-items when possible).
- `TokenTextSplitter` replaced by `lengthMetric: 'tiktoken:*'`.
- Batch helpers.

**Not** exposed: `lengthFunction` callback, custom `separators`,
`HTMLTextSplitter` / `LatexTextSplitter` as distinct classes, and
`createDocuments` / `splitDocuments` (do those in JS after the
split).

See [`__conformance__/divergences.md`](./__conformance__/divergences.md)
for the why.

## License

MIT
