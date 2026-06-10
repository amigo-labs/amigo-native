# @amigo-labs/pdf

> PDF generation — document-as-data API. One FFI call per document,
> no fluent-chain pattern. Backed by
> [`printpdf`](https://crates.io/crates/printpdf).

## Install

```bash
pnpm add @amigo-labs/pdf
```

## Usage

```js
import { generate, generateMany } from '@amigo-labs/pdf'

// Single document — one FFI crossing:
const buf = generate({
  title: 'Invoice',
  pages: [
    {
      width: 210,        // A4 width in mm
      height: 297,       // A4 height in mm
      elements: [
        {
          kind: 'text',
          text: { x: 20, y: 275, text: 'Invoice', fontSize: 24 },
        },
        {
          kind: 'line',
          line: { x1: 20, y1: 265, x2: 190, y2: 265, thickness: 0.5 },
        },
        {
          kind: 'rect',
          rect: { x: 20, y: 100, width: 170, height: 50, filled: false },
        },
      ],
    },
  ],
})
fs.writeFileSync('invoice.pdf', buf)

// Batch — one FFI crossing for the whole label-printing job:
const buffers = generateMany(labelSpecs)
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { generate } from '@amigo-labs/pdf'
```

The PDF engine makes this one of the heavier WASM bundles in the family — consider lazy-importing in code-split routes:

```ts
const { generate } = await import('@amigo-labs/pdf')
```

## Element shapes

```ts
type PdfElement =
  | { kind: 'text'; text: { x: number; y: number; text: string; fontSize?: number } }
  | { kind: 'line'; line: { x1: number; y1: number; x2: number; y2: number; thickness?: number } }
  | { kind: 'rect'; rect: { x: number; y: number; width: number; height: number; filled?: boolean } }
```

## Scope (v0.1)

- Built-in Helvetica font (size only).
- Lines and rectangles (outlined / filled, black only).
- Multi-page documents.
- `generateMany(docs)` for batch label-printing.

## Scope cuts

- **No fluent chain API.** Per-call callbacks would multiply FFI
  crossings — see
  [`docs/perf-review/pdfkit.md`](../../docs/perf-review/pdfkit.md).
- **No custom fonts.** Fast-follow.
- **No images** (JPEG / PNG embedding). Fast-follow.
- **No text layout** (word-wrap, flowing text). You provide
  coordinates.
- **No curves / arbitrary vector paths.**
- **Origin is bottom-left**, units are **mm**. Flip Y if migrating
  from pdfkit.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
