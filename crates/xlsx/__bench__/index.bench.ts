import { test } from 'vitest'
import { readWorkbook, writeWorkbook } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmReadWorkbook: typeof readWorkbook | null = null
let wasmWriteWorkbook: typeof writeWorkbook | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_xlsx_wasm.js')
  wasmReadWorkbook = mod.readWorkbook
  wasmWriteWorkbook = mod.writeWorkbook
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
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

test('read 100-row workbook', async ({ bench }) => {
  await bench('@amigo-labs/xlsx (napi) readWorkbook', () => {
    readWorkbook(SMALL)
  }).run()
  if (wasmReadWorkbook) await bench('@amigo-labs/xlsx (wasm) readWorkbook', () => { wasmReadWorkbook!(SMALL) }).run()
  await bench('xlsx (SheetJS)', () => {
    XLSX.read(SMALL, { type: 'buffer' })
  }).run()
})

test('read 5000-row workbook', async ({ bench }) => {
  await bench('@amigo-labs/xlsx (napi) readWorkbook', () => {
    readWorkbook(MEDIUM)
  }).run()
  if (wasmReadWorkbook) await bench('@amigo-labs/xlsx (wasm) readWorkbook', () => { wasmReadWorkbook!(MEDIUM) }).run()
  await bench('xlsx (SheetJS)', () => {
    XLSX.read(MEDIUM, { type: 'buffer' })
  }).run()
})

const rows100 = buildRows(100)
const rows5000 = buildRows(5000)

test('write 100-row workbook', async ({ bench }) => {
  await bench('@amigo-labs/xlsx (napi) writeWorkbook', () => {
    writeWorkbook([{ name: 'S', rows: rows100 }])
  }).run()
  if (wasmWriteWorkbook) await bench('@amigo-labs/xlsx (wasm) writeWorkbook', () => { wasmWriteWorkbook!([{ name: 'S', rows: rows100 }]) }).run()
})

test('write 5000-row workbook', async ({ bench }) => {
  await bench('@amigo-labs/xlsx (napi) writeWorkbook', () => {
    writeWorkbook([{ name: 'S', rows: rows5000 }])
  }).run()
  if (wasmWriteWorkbook) await bench('@amigo-labs/xlsx (wasm) writeWorkbook', () => { wasmWriteWorkbook!([{ name: 'S', rows: rows5000 }]) }).run()
})
