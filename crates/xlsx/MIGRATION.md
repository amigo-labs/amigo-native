# Migrating from `xlsx` (SheetJS) / `exceljs`

`@amigo-labs/xlsx` is **not** an API-level drop-in. The shapes
differ enough that migration is a small rewrite. The advantage:
read/write is native, the cell model is explicit about types.

## From SheetJS (`xlsx`)

### Read

Before:
```js
import * as XLSX from 'xlsx'
const wb = XLSX.read(buf, { type: 'buffer' })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet)
```

After:
```js
import { readSheetAsObjects, readWorkbook } from '@amigo-labs/xlsx'
const wb = readWorkbook(buf)
const rows = readSheetAsObjects(buf, wb.sheets[0].name)
// rows[i].name is { kind: 'string', text: '...' }
//   — unwrap with rows.map(r => ({ name: r.name.text, age: r.age.number }))
```

### Write

Before:
```js
const wb = XLSX.utils.book_new()
const sheet = XLSX.utils.json_to_sheet(data)
XLSX.utils.book_append_sheet(wb, sheet, 'People')
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
```

After:
```js
import { writeSheetFromObjects } from '@amigo-labs/xlsx'
// explicitly type each cell:
const rows = data.map((d) => ({
  name: { kind: 'string', text: d.name },
  age:  { kind: 'number', number: d.age },
}))
const buf = writeSheetFromObjects('People', rows)
```

## From ExcelJS

ExcelJS's streaming/event API has no direct equivalent. v0.1 loads
the workbook into memory on both read and write. For workbooks
>100 MB, stay on ExcelJS.

## What changes

- **Typed cells**: every cell is `{ kind, ... }`. No implicit
  string/number inference. Your mapping layer picks the field.
- **No `XLSX.utils.*`**: we expose `readSheet`, `readSheetAsObjects`,
  `writeWorkbook`, `writeSheetFromObjects`. The rest is JS.
- **No formatting roundtrip**: styles, borders, colours drop.

## Staying on upstream

- You need formulas evaluated / preserved.
- You need cell formatting / styles / conditional formatting.
- You need charts / pivot tables / drawings.
- You stream-read workbooks >100 MB.
