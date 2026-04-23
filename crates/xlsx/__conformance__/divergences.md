# Divergences — xlsx

`@amigo-labs/xlsx` uses [`calamine`](https://crates.io/crates/calamine)
for reading and
[`rust_xlsxwriter`](https://crates.io/crates/rust_xlsxwriter) for
writing. Neither implements the full SpreadsheetML (Ecma-376) spec
— and neither does `xlsx`/`exceljs` fully. Known gaps:

## Scope

**Covered**:
- Read: .xlsx, .xls (calamine supports both).
- Write: .xlsx only.
- Cell types: string, number, boolean, date, empty.
- Multi-sheet workbooks.
- Unicode.
- Large workbooks (100k+ rows streaming-friendly via calamine).

## Scope cuts

### No formula evaluation

We read cell _values_ (the last-cached result). We do not evaluate
`=A1+B1` on read. Writes do not support formulas in v0.1 — pass the
computed number instead.

### No styles / formatting

- Cell font, colour, background, border, number-format are not
  preserved on read or supported on write.
- Row/column widths default to auto.
- Merged cells: not written (read silently exposes the anchor cell).

### No charts / pivot tables / shapes

The drawings/chart XML parts are ignored. An xlsx with charts
roundtrips losslessly for cell values but loses the visualisation.

### No validation / conditional formatting

Data-validation rules and conditional-formatting metadata are
dropped on roundtrip.

### No shared strings editing

We write inline strings, not a shared-strings table. For workbooks
with heavy string reuse this is slightly larger on disk than
SheetJS's output, but functionally equivalent.

## Write-side differences

- **Date handling**: write takes `{ kind: 'number' }` with the Excel
  serial-date number. Writing `kind: 'date'` with ISO text is not
  supported in v0.1.
- **Cell reference**: we write in row-major order, never sparse. If
  you need sparse cells, emit blank `{ kind: 'empty' }` between
  values.

## Read-side differences

- **Empty trailing cells**: calamine trims empty trailing cells on
  each row. Rows may be shorter than the widest row in the sheet.
- **Dates**: dates are returned as `kind: 'date'` with `number` set
  to the Excel serial-date value (days since 1900-01-00). Convert
  on the JS side: `new Date((n - 25569) * 86400 * 1000)`.
- **Merged cells**: only the top-left cell gets the value; other
  cells in the merge range are empty.

## API shape

We don't attempt drop-in compatibility with SheetJS's `XLSX.utils`.
Use `readSheetAsObjects` / `writeSheetFromObjects` for the
`sheet_to_json` / `json_to_sheet` equivalent.
