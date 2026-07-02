# Perf-Review: `@amigo-labs/pdf`

> **Status:** 🟡 Yellow leaning 🟢 Green (predicted — comparative bench pending) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**Predicted-only.** The bench shard contains absolute throughput for `@amigo-labs/pdf` but **no `pdfkit` baseline rows**, so no measured multiplier exists yet — `docs/packages.json` honestly says `"TBD"`. The candidate review predicted Yellow leaning Green: PDF generation is real serialization work (content streams, xref tables, deflate) with a compact `Buffer` result, a shape that survives the FFI boundary well. The absolute numbers are strong (a simple label renders at ~41 kHz; the batch API sustains ≈45.7k labels/s), and the install-size story is dramatic on its own.

## Evidence

### Measured absolute throughput (docs/benchmarks/pdf.json, 2026-06-10, commit `8c743bf`)

| Scenario | @amigo-labs/pdf | pdfkit | Speedup |
|---|---:|---:|---:|
| simple label | 41 241 Hz | — (not benched) | — |
| A4 multi-page report | 2 027 Hz | — | — |
| batch: 100 labels (`generateMany`) | 457.5 Hz (≈45 750 labels/s) | — | — |

- Install size: **1.35 MB** vs `pdfkit`'s **20.4 MB** `node_modules`.
- `docs/packages.json` speedup: `"TBD"` — to be filled once the comparative bench lands.

### Benchmark gaps

- **The entire comparison.** `pdfkit` baseline rows for the same three scenarios are the open item; until then the verdict stays the candidate's prediction.

## What shipped vs. the candidate prediction

The candidate review scoped "a new package, not a pdfkit drop-in" — that is what shipped:

- Declarative `generate(spec) → Buffer` plus `generateMany` batch API; no fluent chain, no streams.
- **Helvetica only**, no images, no automatic text layout in v0.1.

## Divergences

Not a `pdfkit` drop-in by design; output PDFs are structurally valid (conformance suite parses them) but not byte-comparable to pdfkit's. See `crates/pdf/__conformance__/divergences.md`.

Pre-port assessment: [`pdfkit.md`](./pdfkit.md)

## References

- Crate: `crates/pdf`
- Bench shard: `docs/benchmarks/pdf.json`
- `docs/packages.json` speedup: `"TBD"`
