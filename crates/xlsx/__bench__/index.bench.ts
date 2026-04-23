import { bench, describe } from 'vitest'
import { readWorkbook, writeWorkbook } from '../index.js'
import * as XLSX from 'xlsx'

function buildRows(n: number) {
  return Array.from({ length: n }, (_, i) => [
    { kind: 'string', text: `name${i}` },
    { kind: 'number', number: i },
    { kind: 'string', text: `desc${i}` },
  ])
}

const SMALL = writeWorkbook([{ name: 'S', rows: buildRows(100) }])
const MEDIUM = writeWorkbook([{ name: 'S', rows: buildRows(5000) }])

describe('read 100-row workbook', () => {
  bench('@amigo-labs/xlsx readWorkbook', () => {
    readWorkbook(SMALL)
  })
  bench('xlsx (SheetJS)', () => {
    XLSX.read(SMALL, { type: 'buffer' })
  })
})

describe('read 5000-row workbook', () => {
  bench('@amigo-labs/xlsx readWorkbook', () => {
    readWorkbook(MEDIUM)
  })
  bench('xlsx (SheetJS)', () => {
    XLSX.read(MEDIUM, { type: 'buffer' })
  })
})

const rows100 = buildRows(100)
const rows5000 = buildRows(5000)

describe('write 100-row workbook', () => {
  bench('@amigo-labs/xlsx writeWorkbook', () => {
    writeWorkbook([{ name: 'S', rows: rows100 }])
  })
})

describe('write 5000-row workbook', () => {
  bench('@amigo-labs/xlsx writeWorkbook', () => {
    writeWorkbook([{ name: 'S', rows: rows5000 }])
  })
})
