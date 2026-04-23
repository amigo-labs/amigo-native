# Migrating from `pdf-parse`

`@amigo-labs/pdf-parse` matches upstream's main API shape
(`parse(buffer, opts) → Promise<Result>`) with the same result
fields.

## What works

- `parse(buffer)` — drop-in for `pdfParse(buffer)`.
- `result.text`, `result.numpages`, `result.info`, `result.metadata`.
- `options.max` — limits page count (post-process trim).
- `options.password` — RC4 / AES-128 standard security.
- **New**: `parseSync(buffer)` — synchronous API for small PDFs.

## What changes

- **Default export → named export**: `import { parse }` instead of
  `import pdfParse from 'pdf-parse'`.
- **No `pagerender` callback**: per-page text handler is not
  exposed. Post-process `result.text.split('\x0c')`.
- **`result.version`**: the PDF document's spec version (e.g. `1.7`),
  not the pdf.js version.
- **Page separator**: `\x0c` (form feed) instead of `\n\n`.
  Normalise with `.replace(/\x0c/g, '\n\n')` if needed.
- **Text-ordering**: geometric (top-down) rather than stream-order.
  May affect regex-based extraction pinned on byte offsets.

## Migration checklist

1. Replace `import pdfParse from 'pdf-parse'` with
   `import { parse } from '@amigo-labs/pdf-parse'`.
2. Rename all call sites: `await pdfParse(buf, opts)` →
   `await parse(buf, opts)`.
3. If you use `opts.pagerender`, split the resulting `text` on
   `\x0c` yourself.
4. If your downstream relies on `\n\n` page breaks, normalise.
5. For large-scale batch jobs, prefer `parseSync` on a worker pool
   over `await parse(...)` in a single-threaded loop — worker pool
   amortises module load.

## When to stay on upstream

- **Public-key-encrypted PDFs** (certificate-based security).
- **Scanner-output PDFs** with malformed cross-reference tables
  that only pdf.js's recovery heuristics can handle.
- **Per-page callbacks** that cannot be expressed as a post-process.
- **CJK PDFs with proprietary CMaps** — Adobe's non-Unicode CMap set
  is partially implemented in `pdf-extract`.
