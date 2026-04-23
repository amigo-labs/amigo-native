# Migrating from `pdfkit`

`@amigo-labs/pdf` is **not** a drop-in. The API is document-as-data
instead of fluent chain. The migration pattern is to collect the
commands you'd issue on pdfkit and encode them as an array.

## Before (pdfkit)

```js
import PDFDocument from 'pdfkit'

const doc = new PDFDocument({ size: [283, 141] })  // 100mm × 50mm in points
doc.pipe(fs.createWriteStream('label.pdf'))

doc.fontSize(12).text('Item #12345', 28, 120)
doc.moveTo(28, 100).lineTo(255, 100).stroke()
doc.rect(28, 50, 227, 40).stroke()

doc.end()
```

## After (`@amigo-labs/pdf`)

```js
import { generate } from '@amigo-labs/pdf'
import fs from 'node:fs'

const buf = generate({
  pages: [
    {
      width: 100,      // mm, not points
      height: 50,
      elements: [
        // pdfkit Y=120 (top-down in points) → our Y=50 - 120/2.83 ≈ ~8
        // Our origin is BOTTOM-LEFT, so Y grows upward.
        { kind: 'text', text: { x: 10, y: 25, text: 'Item #12345', fontSize: 12 } },
        { kind: 'line', line: { x1: 10, y1: 20, x2: 90, y2: 20, thickness: 0.5 } },
        { kind: 'rect', rect: { x: 10, y: 5, width: 80, height: 30, filled: false } },
      ],
    },
  ],
})
fs.writeFileSync('label.pdf', buf)
```

## Coordinate-system translation cheat-sheet

| Aspect | pdfkit | `@amigo-labs/pdf` |
|--------|--------|-------------------|
| Units | points (72/inch) | millimetres |
| Origin | top-left | bottom-left |
| Y axis | grows downward | grows upward |
| `text(s, x, y)` | y from top | y from bottom |

Convert:
- `mm = points / 2.835`
- `ourY = pageHeight_mm - pdfkitY_mm`

## What changes

- **No stream / no `pipe()`**. `generate()` returns a `Buffer`.
- **No fluent chain**. Build an element array.
- **No `widthOfString` / `heightOfString`**. We don't measure text.
- **No custom fonts** (yet).
- **No images** (yet).

## Staying on upstream

- You need images in the PDF.
- You need custom fonts.
- You need text layout / word-wrap.
- You need to stream the PDF to disk or HTTP response.
- You use pdfkit's `linearGradient` or `radialGradient`.
