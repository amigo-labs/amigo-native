# Divergences — pdf-parse

`@amigo-labs/pdf-parse` uses [`pdf-extract`](https://crates.io/crates/pdf-extract)
+ [`lopdf`](https://crates.io/crates/lopdf) as the backend.
Upstream `pdf-parse` wraps Mozilla's pdf.js. Different parsers, same
text-extraction shape — divergences are expected on edge-case PDFs.

## Scope cuts

### No `pagerender` user callback

Upstream's `pdf(buf, { pagerender: (pageData) => ... })` lets the
caller intercept each page's text extraction. Per-page JS callbacks
cross the FFI boundary N times per document; we decline to expose
this. Post-process `result.text` split on `\x0c` instead.

### No `max` per-page processing

Our `max` option truncates the output on page-separator boundaries
*after* full extraction. Upstream stops the pdf.js render pipeline
earlier. For very large PDFs with `max: 1`, our wall-time savings
are lower than upstream's.

### No `version` beyond the PDF spec version

Upstream reports `version` as its own pdf.js version. We report the
PDF document's spec version (e.g. `1.7`). The two were never
interchangeable.

## Behavioural gaps

### Text-reordering

pdf.js emits text in page-stream order. `pdf-extract` re-orders by
geometric position (top-to-bottom, left-to-right). Multi-column
layouts and marginalia land in different orders. Consumers that do
regex-based position-anchored extraction will see different offsets.

### Ligatures

`pdf-extract` expands ligatures (`ﬁ` → `fi`) by default. pdf.js can
preserve them depending on font mapping. For search/indexing
workloads (the primary use-case), expansion is the right default.

### AcroForm fields

pdf.js ignores them; `pdf-extract` extracts some. Our output may
contain field labels/values that upstream skips.

### Malformed PDFs

pdf.js has decades of recovery heuristics. `lopdf` / `pdf-extract`
are stricter. Scanner-output PDFs and very old Adobe files may fail
where pdf.js would succeed. **Workaround:** fall back to upstream
`pdf-parse` in a try/catch pipeline.

### Encrypted PDFs

- `pdf-extract` v0.9 supports RC4 and AES-128 standard-security.
- Public-key security is **not** supported. Upstream pdf.js supports
  both.

### CJK CMaps

Adobe's non-Unicode CMaps (GB-EUC-H, UniGB-UTF16-H, etc.) are
partially implemented in `pdf-extract`. For Chinese/Japanese/Korean
corporate PDFs, check the output before committing.

## Byte-level differences

- Page separator: we emit `\x0c` (form feed); upstream emits `\n\n`.
  If your downstream splits on newlines, normalise first.
- Whitespace: `pdf-extract` inserts more generous spaces between
  text-showing operators than pdf.js. Normalise with
  `text.replace(/\s+/g, ' ').trim()` if needed.

## Async vs. sync

Upstream only exposes an async API. We ship both:
- `parseSync(buf)` — blocks the calling thread.
- `parse(buf)` — returns a Promise; runs on libuv's thread pool.

If you want the drop-in shape, use `parse()`.
