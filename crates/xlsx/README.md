# @amigo-labs/xlsx

> XLSX read + write via
> [`calamine`](https://crates.io/crates/calamine) and
> [`rust_xlsxwriter`](https://crates.io/crates/rust_xlsxwriter).
> Buffer in → rows out. Rows in → Buffer out. Single FFI crossing
> per workbook.

## Install

```bash
pnpm add @amigo-labs/xlsx
```

## Usage

### Read

```js
import { readWorkbook, readSheet, readSheetAsObjects } from '@amigo-labs/xlsx'

const wb = readWorkbook(fs.readFileSync('data.xlsx'))
wb.sheets[0].name        // 'Sheet1'
wb.sheets[0].rows[0][0]  // { kind: 'string', text: 'header' }

// Read a single sheet:
const sheet = readSheet(buffer, 'Q3-Data')

// SheetJS-style array-of-objects (first row = headers):
const rows = readSheetAsObjects(buffer, 'People')
// [{ name: { kind: 'string', text: 'Alice' }, age: { kind: 'number', number: 30 } }, ...]
```

### Write

```js
import { writeWorkbook, writeSheetFromObjects } from '@amigo-labs/xlsx'

const buf = writeWorkbook([
  {
    name: 'People',
    rows: [
      [{ kind: 'string', text: 'name' }, { kind: 'string', text: 'age' }],
      [{ kind: 'string', text: 'Alice' }, { kind: 'number', number: 30 }],
    ],
  },
])
fs.writeFileSync('out.xlsx', buf)

// Or from objects (first-row headers auto-derived):
const buf2 = writeSheetFromObjects('People', [
  { name: { kind: 'string', text: 'Alice' }, age: { kind: 'number', number: 30 } },
])
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { readWorkbook, writeWorkbook } from '@amigo-labs/xlsx'
```

The XLSX engine makes this one of the heavier WASM bundles in the family — consider lazy-importing in code-split routes:

```ts
const { readWorkbook } = await import('@amigo-labs/xlsx')
```

## Cell shape

```ts
interface CellValue {
  kind: 'string' | 'number' | 'bool' | 'date' | 'empty' | 'error'
  text?: string
  number?: number
  boolValue?: boolean
}
```

## Scope

- Read `.xlsx` and `.xls`.
- Write `.xlsx`.
- String / number / boolean / date / empty cells.
- Multi-sheet workbooks.

## Scope cuts

- No formulas (neither read-time evaluation nor write).
- No cell formatting / styles / fonts / colours / borders.
- No charts, pivot tables, drawings.
- No data-validation rules or conditional formatting.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
