# Candidate review: `xlsx`

> **Status:** GO (scoped subset, not drop-in parity) · **Predicted:** 🟡 Yellow (Green on medium/large, Yellow on tiny files) · **Reviewed:** 2026-04-20

## Verdict

SheetJS `xlsx` is a bytes-in/bytes-out shape with substantial per-call compute (ZIP inflate + XML parse / emit), which matches the Green pattern — *but* the natural output is structured cell data, and pushing a `Vec<Object>` across NAPI is the exact trap that killed `@amigo-labs/xml`. Port is worth doing only if the API is designed as `Buffer → Buffer` (JSON-serialized rows on both sides), and only as a scoped read/write subset — drop-in parity with SheetJS's full surface (formulas, styles, pivots, 10+ file formats) is out of scope.

## JS package

- **npm:** `xlsx` (SheetJS Community Edition)
- **Downloads:** ~9.6M weekly on the npm registry mirror; upstream SheetJS has been publishing via `cdn.sheetjs.com` since 2022, so the registry copy is stuck at `0.18.5` and is effectively abandoned by the original maintainers.
- **Exports / API surface:** `read` / `readFile` (Buffer / path → workbook), `write` / `writeFile` (workbook → Buffer / file), `utils.sheet_to_json` / `utils.json_to_sheet` / `utils.aoa_to_sheet`, `utils.sheet_add_aoa`, cell-reference helpers, number formats, formula evaluation, `book_new` / `book_append_sheet`. Supports `.xlsx`, `.xlsm`, `.xlsb`, `.xls` (BIFF5/8), `.ods`, `.numbers`, `.csv`, `.dif`, `.prn`, `.html`, `.rtf`.
- **Typical input:** `Buffer` of file bytes, ranging from a 5-row template (~6 KB) to large exports (1–50 MB). For read paths, `ArrayBuffer` / `Uint8Array` is the dominant shape in Node.
- **Typical output:** Workbook object with `SheetNames` + `Sheets[name]` mapping cell addresses (`A1`, `B2`, …) to `{ v, t, w, f, s }` cells. Users then call `utils.sheet_to_json` to get an array of row objects.
- **Realistic median use-case:** In an amigo-context AI/RAG pipeline, the median is "a user uploads a spreadsheet of <= 1 MB, we extract rows as JSON for embedding / table-QA". Write path is secondary — "export these N rows as xlsx for download". Both paths are synchronous-looking, one-shot per request.

## Rust replacement

- **Candidate crate(s):**
  - **Read:** `calamine` — pure Rust, supports `.xlsx` / `.xls` / `.xlsm` / `.ods` / `.xlsb`, zero-copy slicing over memory-mapped bytes, streaming cell iteration. Known to be 2.5–10× faster than alternatives on bulk reads. MIT / Apache-2.0. Actively maintained.
  - **Write:** `rust_xlsxwriter` — pure Rust, by `jmcnamara` (author of the Python `XlsxWriter`). Claims perf "within 10% of the equivalent C library" and ships a "constant memory mode" for large files. MIT / Apache-2.0. Actively maintained.
  - **Read + write (alt, one-crate):** `umya-spreadsheet` — feature-richer than calamine+rust_xlsxwriter (keeps styles/formulas round-tripping) but measurably slower and larger API surface. Not recommended as the primary; useful as a fallback for round-trip parity.
- **Maintenance / license:** Both primary candidates are healthy, dual MIT/Apache-2.0 licensed, widely used (calamine underpins the `python-calamine` wheel; rust_xlsxwriter underpins `rustpy-xlsxwriter`).
- **Known gotchas / divergences:**
  - `calamine` "focuses on cell values and VBA code; many (most) parts of the spec are not implemented" — styles, conditional formats, charts, pivot tables are lost on read.
  - `rust_xlsxwriter` defaults for number formatting, date serial, and column widths differ from SheetJS in subtle ways; exported files will not be byte-identical to SheetJS output even when visually equivalent.
  - calamine + rust_xlsxwriter are **two independent crates** — there's no shared "workbook" value that round-trips read→edit→write while preserving styles. Any port that needs mutate-in-place has to use `umya-spreadsheet` and pay the perf cost.
  - Formula evaluation is not supported by either primary candidate (calamine returns the stored cached value; it does not recompute).

## BACKLOG check

No prior entry in `BACKLOG.md` for `xlsx` / `excel` / `spreadsheet`. The "AI / RAG preprocessing" category is the natural home if this lands as NO-GO.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **High.** Read path: ZIP inflate (~1–2 ns/byte via `zlib-rs` / `miniz_oxide`) + streaming XML parse over the inflated sheet XML (~5–10 ns/byte with `quick-xml`). A 1 MB xlsx ≈ 10–50 ms of pure Rust compute; a 100 KB xlsx ≈ 1–5 ms. Write path is symmetric. This is comfortably above the 10 µs "FFI-overhead < 10 %" threshold from `docs/BASELINE.md` for any realistic file size. |
| Input size distribution | File bytes range ~6 KB (tiny template) to 50+ MB (data exports). Median is likely 50 KB – 2 MB per BASELINE § 3. Input-as-`Buffer` is flat ~180 ns regardless of size — the **cheap lane**. |
| Output size distribution | **This is the danger.** Natural output is a `SheetNames[]` + `Sheets[name]` object with one JS value per cell. A 10k-row × 20-col sheet = 200k cells; at ~43 ns/element of `Vec<Object>` marshalling that's ~8.6 ms of pure overhead, which dwarfs the algorithmic work and directly reproduces the `xml.md` post-mortem trap ("Returning event trees as JS objects means V8 `JSON.parse` on the output dominates"). The port **must** expose a Buffer-return variant (`readWorkbookJson(buf) → Buffer` whose bytes are a JSON string) so callers can decide whether to pay the `JSON.parse` cost — and so V8's native `JSON.parse` does the object construction, not NAPI. |
| Reusable setup (stateful potential) | Moderate. A NAPI `Workbook` class makes sense for multi-sheet reads where JS pulls `workbook.sheet(name).rowsJson()` per sheet, or for write paths where multiple `addSheet(...)` calls precede a single `toBuffer()`. Per-sheet iteration cost amortizes the ZIP/XML setup over many reads. |
| Batch-usage realism | Low-to-moderate. Each call is "one file" — the batch is inside the file (many rows), not across files. The iterator/class API is the more useful lever than a hypothetical `readManyWorkbooks`. |
| FFI-share estimate vs. Rust work | For a 100 KB+ file with the Buffer-in / Buffer-out design: **FFI < 5 % of total** — Green headroom. For a 5 KB template with the same design: **FFI ~30–50 %** — Yellow. If the naïve `Vec<Object>` output API is exposed (tempting for drop-in ergonomics), **FFI share inverts** — Red/Black at every size, same as `xml` and `deep-equal`. |

## Classification reasoning

xlsx has the right **physics** for a Green port on the compute side — ZIP inflate plus XML parse is exactly the kind of substantial bytes-in/bytes-out work where `@amigo-labs/inflate`, `@amigo-labs/zip`, and `@amigo-labs/sanitize-html` win. The Rust toolchain (calamine + rust_xlsxwriter) is mature, measured, and already beats JS competitors by 2.5–10× in standalone benchmarks.

What keeps the prediction at **Yellow**, not Green, is three things:

1. **The natural output shape is structured, not bytes.** The moment the API returns a workbook object built from per-cell NAPI calls, the port turns into `xml` — a 3× win on the decode-only path that evaporates when V8 has to materialize the tree. The only way out is to serialize the workbook to a JSON string inside Rust and return that as a `Buffer`; the caller pays one `JSON.parse` which runs on V8's native-code fast path, not the NAPI object-construction slow path. That design works, but it's not drop-in SheetJS ergonomics.

2. **Small files blunt the gain.** A 5 KB xlsx template — which is realistic in form-generation workflows — gives Rust maybe 500 µs of compute to work with, and FFI + JSON round-trip is the same order of magnitude. Small-bucket perf will be Yellow even with the best API design. This is the benchmark scenario that decides the final classification; it must be present on day one, not added after launch.

3. **Parity is explicitly a subset, not a superset.** SheetJS users who rely on formula evaluation, styles, charts, or `.xls` / `.numbers` input will not find a drop-in replacement in calamine + rust_xlsxwriter. Positioning must be "read + write basic xlsx" — migration is a deliberate decision, not a `npm i` swap.

There are also non-perf tailwinds that make this worth doing even at Yellow: SheetJS has been **abandoned on npm** since 2022 (stuck at 0.18.5, CVE-2023-30533 and CVE-2024-22363 in registry versions), their move to a private CDN breaks standard package-manager workflows, and the install footprint (~2 MB) is disproportionate for a node workload that only needs basic read/write. A focused, safe, CVE-free, `Buffer`-first alternative has value on grounds beyond raw µs-per-op.

Reference patterns from the post-mortem: shape aligns with `inflate` (Green) on the compute side, with `xml` (Red) on the output side, and with `zip` (Green) on the Buffer-in/Buffer-out ergonomics. Net prediction: **Yellow, migrating to Green** if the API is designed for Buffer-first from day one *and* small-file perf is within ~0.8× of SheetJS.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/xlsx`
- **Primary API sketch:**
  ```ts
  /** Read-side: workbook bytes → JSON-serialized workbook bytes.
   *  Caller runs JSON.parse so V8's native path materializes cells. */
  export function readWorkbookJson(file: Buffer, opts?: ReadOptions): Buffer;

  /** Read-side, typed-array fast path for a single sheet (numeric-heavy). */
  export function readSheetAsArrays(
    file: Buffer,
    sheet: string | number,
  ): { headers: string[]; rows: Buffer /* JSON-encoded rows */ };

  /** Write-side: JSON-encoded workbook bytes → xlsx Buffer.
   *  Mirror of read path: caller runs JSON.stringify, Rust parses once. */
  export function writeWorkbookJson(workbookJson: Buffer): Buffer;

  /** Optional stateful class for multi-sheet or streaming reads. */
  export class Workbook {
    constructor(file: Buffer);
    sheetNames(): string[];
    sheetAsJson(name: string | number): Buffer;
    close(): void;
  }

  export interface ReadOptions {
    cellDates?: boolean;  // mirror SheetJS semantics
    sheets?: string[];    // early-exit on large .xlsx with many sheets
    raw?: boolean;        // return string cells verbatim, skip type coercion
  }
  ```
  Rationale: every public function is `Buffer → Buffer` or (`Buffer`, primitives) → `Buffer`. No `Vec<Object>` crossings. Drop-in sugar like `sheet_to_json` can live in a tiny JS wrapper that calls `readWorkbookJson` + `JSON.parse`.

- **Must-have benchmark scenarios:**
  - **Tiny** — 5-row × 3-col single-sheet xlsx (~6 KB). Decides whether small-bucket is Yellow or Red.
  - **Medium** — 1 000-row × 10-col single-sheet (~80 KB). The realistic AI/RAG median.
  - **Large** — 100 000-row × 20-col single-sheet (~15 MB). Showcase scenario; this is where calamine's 10–50× headline lives.
  - **Multi-sheet** — 10 sheets × 1 000 rows (~500 KB). Exercises the `Workbook` class path.
  - **Write-tiny** — 5 rows out (~6 KB). Small-write bucket.
  - **Write-medium** — 1 000 rows out (~80 KB). Realistic export.
  - **Write-large** — 100 000 rows out (~15 MB). `rust_xlsxwriter` constant-memory mode showcase.
  - JS competitor set: `xlsx@0.18.5` (registry SheetJS), `exceljs` (the current npm-shipping alternative), `node-xlsx` (thin SheetJS wrapper; lower bound).

- **Acceptance thresholds (Green gate):**
  - Medium + Large read: ≥2× vs SheetJS `xlsx`, ≥2× vs `exceljs`.
  - Tiny read: ≥0.8× vs SheetJS (do not regress; parity is acceptable).
  - Medium + Large write: ≥2× vs SheetJS, ≥2× vs `exceljs`.
  - Tiny write: ≥0.8× vs SheetJS.
  - Parity: row-count and cell-value round-trip for `string`, `number`, `boolean`, `date` (as ISO string in JSON), `null/empty`. Errors surfaced as typed JS errors with the sheet/row/col coordinate.
  - Bundle-size: install footprint ≤ 60 % of SheetJS's (~2 MB → ~1.2 MB cap for our crate including platform binaries for the primary target).

- **Risks:**
  - **Output-marshalling trap.** If a user bypasses `readWorkbookJson` and insists on per-cell access, they hit the `xml.md` failure mode. Mitigate: do not expose a per-cell NAPI API at all; force the Buffer path.
  - **Parity surface.** Formula evaluation, styles, charts, pivots, `.xls` legacy, `.numbers` — none of these are covered. README must lead with a "not drop-in — subset only" banner. Migration doc lists the features we intentionally drop.
  - **Date handling drift.** SheetJS's `cellDates: true` semantics, Excel's 1900-leap-year bug, timezone handling — these are minefields; commit to ISO-string dates in JSON output and document the rule.
  - **Write-path byte-diff.** `rust_xlsxwriter` output will not be byte-identical to SheetJS output; if any downstream tests diff bytes, they break. This is visible but defensible.
  - **Benchmark-gap downgrade.** If the tiny-file bucket is skipped or deferred, the Phase-C rules mandate downgrading one tier until it's closed. Lock the full size matrix before first publish.
  - **calamine / rust_xlsxwriter version drift.** Both are actively evolving; pin minor versions and track breaking changes in a `UPSTREAM.md` the way `commonmark` does for `pulldown-cmark`.

## If NO-GO — BACKLOG entry

```markdown
- **xlsx** (~9.6M, SheetJS abandoned on npm since 2022). Underlying crates (`calamine` + `rust_xlsxwriter`) are Green-shape on compute, but natural API returns a workbook-of-cells which repeats the `xml.md` post-mortem trap — V8 `JSON.parse` beats per-cell NAPI marshalling. Port is viable only as a scoped, Buffer-in/Buffer-out subset; users who need formulas/styles/pivots would bounce back to SheetJS. Small-file bucket (tiny templates <10 KB) is Yellow even under the best API design. Revisit if realistic median file size settles above ~100 KB or if FFI-side JSON-streaming lowers the small-bucket floor.
```

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing → Predicted Yellow (green on large inputs, marginal on small)**

Sources:
- [xlsx - SheetJS (npm)](https://www.npmjs.com/package/xlsx)
- [npm package with 1.4M weekly downloads ditches npmjs.com for own CDN](https://www.bleepingcomputer.com/news/software/npm-package-with-14m-weekly-downloads-ditches-npmjscom-for-own-cdn/)
- [SheetJS Security Advisories](https://cdn.sheetjs.com/advisories/)
- [CVE-2023-30533 (prototype pollution)](https://cdn.sheetjs.com/advisories/CVE-2023-30533)
- [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363)
- [tafia/calamine on GitHub](https://github.com/tafia/calamine)
- [calamine on crates.io](https://crates.io/crates/calamine)
- [jmcnamara/rust_xlsxwriter on GitHub](https://github.com/jmcnamara/rust_xlsxwriter)
- [rust_xlsxwriter on docs.rs](https://docs.rs/rust_xlsxwriter/latest/rust_xlsxwriter/)
- [SynthGL/ExcelBench benchmark suite](https://github.com/SynthGL/ExcelBench)
- [exceljs vs sheetjs vs xlsx (npm trends)](https://npmtrends.com/exceljs-vs-sheetjs-vs-xlsx)
