import { bench, describe } from 'vitest'
import { render, renderBytes, renderFast, renderBytesFast, renderMany } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmRender: typeof render | null = null
let wasmRenderBytes: typeof renderBytes | null = null
let wasmRenderFast: typeof renderFast | null = null
let wasmRenderBytesFast: typeof renderBytesFast | null = null
let wasmRenderMany: typeof renderMany | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_commonmark_wasm.js')
  wasmRender = mod.render
  wasmRenderBytes = mod.renderBytes
  wasmRenderFast = mod.renderFast
  wasmRenderBytesFast = mod.renderBytesFast
  wasmRenderMany = mod.renderMany
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import { marked } from 'marked'
import MarkdownIt from 'markdown-it'

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: false })
const fastOpts = { headingIds: false, unsafeHtml: true }

// --- Fixtures ---

const small = `# Hello

A short paragraph with **bold**, *italic*, \`code\`, and a [link](https://example.com).

- one
- two
- three
`

const medium = `# Release Notes

## Summary

This release introduces several improvements across the **parser**, _renderer_, and public API. See the table below for impact.

| Area | Change | Breaking |
|:--|:-:|--:|
| Parser | stricter heading detection | no |
| Renderer | HTML output tightened | no |
| API | new \`renderMany\` helper | no |

## Details

### Parser

The parser now handles nested blockquotes more reliably:

> outer
> > inner
> > > deeper

### Renderer

Heading IDs are now slugified by default. Code blocks emit a language class:

\`\`\`typescript
export function render(input: string): string {
  return commonmark.render(input)
}
\`\`\`

### Task list

- [x] parser rewrite
- [x] renderer rewrite
- [ ] benchmarks published
- [ ] docs migrated

## Migration

If you were relying on the raw \`<div>\` passthrough, pass \`unsafeHtml: true\`. See [divergences](./divergences.md).

~~Obsolete feature removed.~~ Replaced by the new API.
`.repeat(3)

// Large: ~100 KB — mimic a big docs page
const large = (() => {
  const section = `## Section

Paragraph with **emphasis**, *stress*, and \`inline code\`.

\`\`\`js
function example() {
  return [1, 2, 3].map(x => x * 2)
}
\`\`\`

- item
- item
- item

| col | col |
|---|---|
| a | b |
| c | d |

`
  return '# Big Document\n\n' + section.repeat(400)
})()

const small1k = Buffer.byteLength(small, 'utf8')
const medium50k = Buffer.byteLength(medium, 'utf8')
const large100k = Buffer.byteLength(large, 'utf8')
// byte-size comments so the bench output carries intent
void small1k; void medium50k; void large100k

// --- Benches ---

const smallBuf = Buffer.from(small, 'utf8')
const mediumBuf = Buffer.from(medium, 'utf8')
const largeBuf = Buffer.from(large, 'utf8')

describe(`small (~${Math.round(Buffer.byteLength(small) / 100) / 10} KB)`, () => {
  bench('@amigo-labs/commonmark (napi) render', () => {
    render(small)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render', () => { wasmRender!(small) })
  bench('@amigo-labs/commonmark (napi) renderBytes', () => {
    renderBytes(smallBuf)
  })
  if (wasmRenderBytes) bench('@amigo-labs/commonmark (wasm) renderBytes', () => { wasmRenderBytes!(smallBuf) })
  bench('@amigo-labs/commonmark (napi) render (fast opts)', () => {
    render(small, fastOpts)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render (fast opts)', () => { wasmRender!(small, fastOpts) })
  bench('@amigo-labs/commonmark (napi) renderFast', () => {
    renderFast(small)
  })
  if (wasmRenderFast) bench('@amigo-labs/commonmark (wasm) renderFast', () => { wasmRenderFast!(small) })
  bench('@amigo-labs/commonmark (napi) renderBytesFast', () => {
    renderBytesFast(smallBuf)
  })
  if (wasmRenderBytesFast) bench('@amigo-labs/commonmark (wasm) renderBytesFast', () => { wasmRenderBytesFast!(smallBuf) })
  bench('marked', () => {
    marked.parse(small)
  })
  bench('markdown-it', () => {
    mdit.render(small)
  })
})

describe(`medium (~${Math.round(Buffer.byteLength(medium) / 100) / 10} KB)`, () => {
  bench('@amigo-labs/commonmark (napi) render', () => {
    render(medium)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render', () => { wasmRender!(medium) })
  bench('@amigo-labs/commonmark (napi) renderBytes', () => {
    renderBytes(mediumBuf)
  })
  if (wasmRenderBytes) bench('@amigo-labs/commonmark (wasm) renderBytes', () => { wasmRenderBytes!(mediumBuf) })
  bench('@amigo-labs/commonmark (napi) render (fast opts)', () => {
    render(medium, fastOpts)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render (fast opts)', () => { wasmRender!(medium, fastOpts) })
  bench('marked', () => {
    marked.parse(medium)
  })
  bench('markdown-it', () => {
    mdit.render(medium)
  })
})

describe(`large (~${Math.round(Buffer.byteLength(large) / 1024)} KB)`, () => {
  bench('@amigo-labs/commonmark (napi) render', () => {
    render(large)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render', () => { wasmRender!(large) })
  bench('@amigo-labs/commonmark (napi) renderBytes', () => {
    renderBytes(largeBuf)
  })
  if (wasmRenderBytes) bench('@amigo-labs/commonmark (wasm) renderBytes', () => { wasmRenderBytes!(largeBuf) })
  bench('@amigo-labs/commonmark (napi) render (fast opts)', () => {
    render(large, fastOpts)
  })
  if (wasmRender) bench('@amigo-labs/commonmark (wasm) render (fast opts)', () => { wasmRender!(large, fastOpts) })
  bench('marked', () => {
    marked.parse(large)
  })
  bench('markdown-it', () => {
    mdit.render(large)
  })
})

describe('batch — renderMany (500 × medium docs)', () => {
  const batch = Array.from({ length: 500 }, () => medium)
  bench('@amigo-labs/commonmark (napi) renderMany (parallel)', () => {
    renderMany(batch)
  })
  if (wasmRenderMany) bench('@amigo-labs/commonmark (wasm) renderMany (parallel)', () => { wasmRenderMany!(batch) })
  bench('@amigo-labs/commonmark (napi) per-call loop', () => {
    const out: string[] = []
    for (const d of batch) out.push(render(d))
  })
  bench('marked per-call loop', () => {
    const out: string[] = []
    for (const d of batch) out.push(marked.parse(d) as string)
  })
  bench('markdown-it per-call loop', () => {
    const out: string[] = []
    for (const d of batch) out.push(mdit.render(d))
  })
})
