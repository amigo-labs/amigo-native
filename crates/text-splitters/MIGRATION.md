# Migrating from `@langchain/textsplitters`

## What works

| langchain                                    | amigo                                               |
|---------------------------------------------|----------------------------------------------------|
| `new RecursiveCharacterTextSplitter(opts).splitText(t)` | `splitText(t, opts)`                    |
| `new MarkdownTextSplitter(opts).splitText(t)`           | `splitMarkdown(t, opts)`                 |
| `new TokenTextSplitter({ encodingName: 'cl100k_base', chunkSize, chunkOverlap }).splitText(t)` | `splitText(t, { chunkSize, chunkOverlap, lengthMetric: 'tiktoken:cl100k_base' })` |
| Batch via `Promise.all(docs.map(d => splitter.splitText(d)))` | `splitTextBatch(docs, opts)` (single FFI crossing) |

## What changes

- **No `lengthFunction` option.** Use `lengthMetric: 'tiktoken:*'`
  or pre-chunk with your own JS counter and pass fixed-size strings.
- **No custom `separators`.** `text-splitter`'s default semantic
  hierarchy handles paragraphs/sentences/words/graphemes. Pre-split
  on markers you care about before calling.
- **No `createDocuments` / `splitDocuments`.** Do it in JS:
  ```js
  const chunks = splitText(text, opts)
  const docs = chunks.map((pageContent) => ({ pageContent, metadata }))
  ```
- **No `HTMLTextSplitter` / `LatexTextSplitter`.** Use `splitText`
  directly — the default hierarchy is format-agnostic.

## Migration checklist

1. Replace `new RecursiveCharacterTextSplitter(opts)` with a direct
   `splitText(text, opts)` call.
2. If you used `TokenTextSplitter`, switch to
   `lengthMetric: 'tiktoken:cl100k_base'` on `splitText`.
3. Replace `.createDocuments` with inline JS mapping.
4. Validate chunk counts — the segmentation engine is `text-splitter`
   (not langchain's regex), so cut-points differ on ambiguous text.

## Staying on upstream

- You need a custom `lengthFunction`.
- You rely on a custom `separators` array (e.g. splitting on
  `---` or Markdown front-matter fences).
- You need `HTMLTextSplitter` with HTML-aware boundaries beyond what
  the default splitter handles.
