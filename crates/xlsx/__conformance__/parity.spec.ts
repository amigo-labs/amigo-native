import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../index.js'
import * as XLSX from 'xlsx'

describe('parity: read our-written XLSX with SheetJS', () => {
  it('SheetJS sees the same values we wrote', () => {
    const bytes = writeWorkbook([
      {
        name: 'Sheet1',
        rows: [
          [
            { kind: 'string', text: 'name' },
            { kind: 'string', text: 'age' },
          ],
          [
            { kind: 'string', text: 'Alice' },
            { kind: 'number', number: 30 },
          ],
        ],
      },
    ])
    const wb = XLSX.read(bytes, { type: 'buffer' })
    expect(wb.SheetNames).toEqual(['Sheet1'])
    const sheet = wb.Sheets['Sheet1']
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    expect(rows[0].name).toBe('Alice')
    expect(rows[0].age).toBe(30)
  })
})

describe('parity: read SheetJS-written XLSX with us', () => {
  it('we see the same values SheetJS wrote', () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ])
    XLSX.utils.book_append_sheet(wb, sheet, 'People')
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const ours = readWorkbook(bytes)
    expect(ours.sheets[0].name).toBe('People')
    // First row is header, second row is Alice/30
    expect(ours.sheets[0].rows[1][0].text).toBe('Alice')
    expect(ours.sheets[0].rows[1][1].number).toBe(30)
  })
})
