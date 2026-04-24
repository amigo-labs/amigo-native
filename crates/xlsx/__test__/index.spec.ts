import { describe, expect, it } from 'vitest'
import {
  readWorkbook,
  readSheet,
  readSheetAsObjects,
  writeWorkbook,
  writeSheetFromObjects,
} from '../index.js'

function str(s: string) {
  return { kind: 'string', text: s }
}
function num(n: number) {
  return { kind: 'number', number: n }
}
function bool_(b: boolean) {
  return { kind: 'bool', boolValue: b }
}

describe('writeWorkbook + readWorkbook roundtrip', () => {
  it('preserves strings and numbers', () => {
    const bytes = writeWorkbook([
      {
        name: 'Sheet1',
        rows: [
          [str('name'), str('age')],
          [str('Alice'), num(30)],
          [str('Bob'), num(25)],
        ],
      },
    ])
    const wb = readWorkbook(bytes)
    expect(wb.sheets).toHaveLength(1)
    expect(wb.sheets[0].name).toBe('Sheet1')
    expect(wb.sheets[0].rows[1][0].text).toBe('Alice')
    expect(wb.sheets[0].rows[1][1].number).toBe(30)
  })

  it('handles booleans', () => {
    const bytes = writeWorkbook([
      {
        name: 'Flags',
        rows: [[bool_(true), bool_(false)]],
      },
    ])
    const wb = readWorkbook(bytes)
    expect(wb.sheets[0].rows[0][0].boolValue).toBe(true)
    expect(wb.sheets[0].rows[0][1].boolValue).toBe(false)
  })

  it('handles multiple sheets', () => {
    const bytes = writeWorkbook([
      { name: 'A', rows: [[str('x')]] },
      { name: 'B', rows: [[num(42)]] },
    ])
    const wb = readWorkbook(bytes)
    expect(wb.sheets).toHaveLength(2)
    expect(wb.sheets[0].name).toBe('A')
    expect(wb.sheets[1].name).toBe('B')
  })
})

describe('readSheet by name', () => {
  it('reads the requested sheet only', () => {
    const bytes = writeWorkbook([
      { name: 'Alpha', rows: [[str('a')]] },
      { name: 'Beta', rows: [[str('b')]] },
    ])
    const sheet = readSheet(bytes, 'Beta')
    expect(sheet.name).toBe('Beta')
    expect(sheet.rows[0][0].text).toBe('b')
  })

  it('throws on unknown sheet', () => {
    const bytes = writeWorkbook([{ name: 'A', rows: [] }])
    expect(() => readSheet(bytes, 'NotThere')).toThrow()
  })
})

describe('readSheetAsObjects / writeSheetFromObjects', () => {
  it('SheetJS-style roundtrip', () => {
    const bytes = writeSheetFromObjects('People', [
      { name: str('Alice'), age: num(30) },
      { name: str('Bob'), age: num(25) },
    ])
    const rows = readSheetAsObjects(bytes, 'People')
    expect(rows).toHaveLength(2)
    expect(rows[0].name.text).toBe('Alice')
    expect(rows[0].age.number).toBe(30)
  })

  it('handles union of keys across rows', () => {
    const bytes = writeSheetFromObjects('Data', [
      { a: str('x') },
      { b: str('y') },
    ])
    const rows = readSheetAsObjects(bytes, 'Data')
    expect(rows).toHaveLength(2)
  })
})

describe('error handling', () => {
  it('throws on non-XLSX buffer', () => {
    expect(() => readWorkbook(Buffer.from('not xlsx'))).toThrow()
  })
})
