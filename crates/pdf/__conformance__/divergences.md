# Divergences — pdf

`@amigo-labs/pdf` is **not** a drop-in for
[`pdfkit`](https://www.npmjs.com/package/pdfkit). The API shape is
deliberately different — per docs/perf-review/pdfkit.md, the fluent
chain-API would require N × FFI crossings per document.

## API shape

### No fluent chain

```js
// pdfkit
doc.fontSize(24).text('Title', 72, 720)
   .moveDown()
   .fontSize(12).text('Body...')
```

Would require 6 FFI crossings. We take a single spec:

```js
generate({
  pages: [{
    width: 210, height: 297,
    elements: [
      { kind: 'text', text: { x: 72, y: 720, text: 'Title', fontSize: 24 } },
      { kind: 'text', text: { x: 72, y: 700, text: 'Body...', fontSize: 12 } },
    ],
  }],
})
```

### No Node Readable stream

pdfkit is a stream (`doc.pipe(fs.createWriteStream(...))`). We
return a `Buffer`. For very large PDFs, buffer everything in memory
or partition into `generateMany()` batches.

### No measurement helpers

pdfkit exposes `doc.widthOfString(text)`, `heightOfString`, etc. for
text layout. We don't measure — you provide coordinates.

## v0.1 scope cuts

### No custom fonts

Only the built-in Helvetica is available. Custom TTF embedding is
fast-follow (v0.2). Until then, stay on pdfkit for non-Helvetica
fonts.

### No images

JPEG / PNG embedding is fast-follow. Use pdfkit for image-heavy
PDFs.

### No text layout

Word-wrap, line-breaking, and alignment are the caller's
responsibility. We draw text at absolute x/y coordinates only.

### No vector paths

Only lines and rectangles (outlined or filled). Curves, polygons,
and arbitrary paths are fast-follow.

### Color defaults

Black stroke, black fill. No stroke-color / fill-color options in
v0.1.

### Coordinate system

- Origin is **bottom-left** (printpdf's native), **not** top-left
  (pdfkit's default). You may need to flip Y: `y = pageHeight - yPdfkit`.
- Units are **millimetres**, not points.

## When to stay on upstream

- You need image embedding.
- You need measurement + word-wrapping / flowing text.
- You need custom fonts.
- You need curves / arbitrary vector paths.
- You need metadata (PDF/A, encryption, accessibility tags).
