import { bench, describe } from 'vitest'
import { render, renderMany } from '../index.js'
import { marked } from 'marked'
import MarkdownIt from 'markdown-it'

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: false })

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

describe(`small (~${Math.round(Buffer.byteLength(small) / 100) / 10} KB)`, () => {
  bench('@amigo-labs/commonmark', () => {
    render(small)
  })
  bench('marked', () => {
    marked.parse(small)
  })
  bench('markdown-it', () => {
    mdit.render(small)
  })
})

describe(`medium (~${Math.round(Buffer.byteLength(medium) / 100) / 10} KB)`, () => {
  bench('@amigo-labs/commonmark', () => {
    render(medium)
  })
  bench('marked', () => {
    marked.parse(medium)
  })
  bench('markdown-it', () => {
    mdit.render(medium)
  })
})

describe(`large (~${Math.round(Buffer.byteLength(large) / 1024)} KB)`, () => {
  bench('@amigo-labs/commonmark', () => {
    render(large)
  })
  bench('marked', () => {
    marked.parse(large)
  })
  bench('markdown-it', () => {
    mdit.render(large)
  })
})

describe('batch — renderMany (500 × medium docs)', () => {
  const batch = Array.from({ length: 500 }, () => medium)
  bench('@amigo-labs/commonmark renderMany', () => {
    renderMany(batch)
  })
  bench('@amigo-labs/commonmark per-call loop', () => {
    const out: string[] = []
    for (const d of batch) out.push(render(d))
  })
  bench('marked per-call loop', () => {
    const out: string[] = []
    for (const d of batch) out.push(marked.parse(d) as string)
  })
})
