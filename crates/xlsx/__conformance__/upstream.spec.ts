import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../index.js'

describe('XLSX smoke scenarios', () => {
  it('empty workbook writes and re-reads', () => {
    const bytes = writeWorkbook([{ name: 'Empty', rows: [] }])
    const wb = readWorkbook(bytes)
    expect(wb.sheets).toHaveLength(1)
    expect(wb.sheets[0].rows).toEqual([])
  })

  it('unicode in cell text', () => {
    const bytes = writeWorkbook([
      {
        name: 'Uni',
        rows: [[{ kind: 'string', text: 'Größe' }, { kind: 'string', text: '漢字' }]],
      },
    ])
    const wb = readWorkbook(bytes)
    expect(wb.sheets[0].rows[0][0].text).toBe('Größe')
    expect(wb.sheets[0].rows[0][1].text).toBe('漢字')
  })

  it('100-row workbook roundtrips', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [
      { kind: 'string', text: `row${i}` },
      { kind: 'number', number: i },
    ])
    const bytes = writeWorkbook([{ name: 'Big', rows }])
    const wb = readWorkbook(bytes)
    expect(wb.sheets[0].rows).toHaveLength(100)
    expect(wb.sheets[0].rows[50][0].text).toBe('row50')
    expect(wb.sheets[0].rows[50][1].number).toBe(50)
  })

  it('multi-sheet workbook', () => {
    const bytes = writeWorkbook([
      { name: 'A', rows: [[{ kind: 'number', number: 1 }]] },
      { name: 'B', rows: [[{ kind: 'number', number: 2 }]] },
      { name: 'C', rows: [[{ kind: 'number', number: 3 }]] },
    ])
    const wb = readWorkbook(bytes)
    expect(wb.sheets.map((s) => s.name)).toEqual(['A', 'B', 'C'])
  })
})
