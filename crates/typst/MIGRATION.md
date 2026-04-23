# Adopting `@amigo-labs/typst`

There's no drop-in predecessor — Typst is a new language. This
document covers the two most common migration paths.

## From `typst compile` CLI

Before:
```sh
typst compile invoice.typ invoice.pdf --input name=Alice
```

After:
```js
import fs from 'node:fs'
import { compile } from '@amigo-labs/typst'

const source = fs.readFileSync('invoice.typ', 'utf-8')
const { pdf } = compile(source, { data: { name: 'Alice' } })
fs.writeFileSync('invoice.pdf', pdf)
```

Differences from the CLI:
- Single-file source only. Multi-file imports (`#import "a.typ"`)
  don't work — concatenate first.
- `@preview/*` imports don't work — inline the package source.
- No watch mode (library API, not daemon).

## From Puppeteer / `html-pdf-node`

Before:
```js
import puppeteer from 'puppeteer'
const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.setContent(html)
const pdf = await page.pdf({ format: 'A4' })
await browser.close()
```

After:
```js
import { compile } from '@amigo-labs/typst'

// rewrite HTML template as Typst source:
const source = `
#set page(paper: "a4", margin: 2cm)
${typstContent}
`
const { pdf } = compile(source, { data })
```

Benefits vs. Puppeteer:
- ~10–50× faster for multi-page documents (no browser process
  boot, no DOM).
- No Chromium dependency (~200 MB → 0 MB, after swapping to this
  package's ~15 MB).
- Deterministic output across runs (bundled fonts).

Cost:
- Learning curve on Typst template syntax.
- Can't reuse HTML + CSS from your frontend directly.

## From `pdfmake`

Before:
```js
import pdfMake from 'pdfmake/build/pdfmake'
const docDefinition = {
  content: [
    { text: 'Invoice', style: 'header' },
    { table: { body: rows } },
  ],
  styles: { header: { fontSize: 18, bold: true } },
}
pdfMake.createPdf(docDefinition).getBuffer((buf) => { ... })
```

After:
```js
import { compile } from '@amigo-labs/typst'
const { pdf } = compile(`
  #set text(size: 10pt)
  = Invoice
  #table(columns: 3, ..rows)
`, { data: { rows: ... } })
```

Benefits vs. pdfmake:
- Better typography (real Typst math + hyphenation).
- Smaller per-document output (fewer embedded glyphs).

## When to NOT use this

- Your templates need CJK / Arabic / Devanagari scripts — pass
  additional fonts via `options.fonts`.
- You need real-time rendering with state-dependent typography
  (animated reports). Stay on a browser pipeline.
- You need `@preview/*` packages at runtime. Stay on the CLI.
