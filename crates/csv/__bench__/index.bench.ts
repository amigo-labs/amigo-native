import { bench, describe } from 'vitest'
import { parse as amigoParse, parseToJson as amigoParseJson } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmAmigoParse: typeof amigoParse | null = null
let wasmAmigoParseJson: typeof amigoParseJson | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_csv_wasm.js')
  wasmAmigoParse = mod.parse
  wasmAmigoParseJson = mod.parseToJson
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import { parse as csvParseSyncFn } from 'csv-parse/sync'
import Papa from 'papaparse'

// --- Fixture generators ---

function generateCsv(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `col${i}`).join(',')
  const lines = [header]
  for (let i = 0; i < rows; i++) {
    lines.push(Array.from({ length: cols }, (_, j) => `val_${i}_${j}`).join(','))
  }
  return lines.join('\n')
}

const csv100 = generateCsv(100, 5)
const csv10k = generateCsv(10_000, 5)
const csv100k = generateCsv(100_000, 10)

const buf100 = Buffer.from(csv100)
const buf10k = Buffer.from(csv10k)
const buf100k = Buffer.from(csv100k)

// --- parse (100 rows) ---

describe('csv parse - 100 rows, 5 cols', () => {
  bench('@amigo-labs/csv (napi)', () => { amigoParse(buf100) })
  if (wasmAmigoParse) bench('@amigo-labs/csv (wasm)', () => { wasmAmigoParse!(buf100) })
  bench('@amigo-labs/csv (napi) (parseToJson)', () => { JSON.parse(amigoParseJson(buf100)) })
  bench('csv-parse (sync)', () => { csvParseSyncFn(csv100, { columns: true }) })
  bench('papaparse', () => { Papa.parse(csv100, { header: true }) })
})

// --- parse (10k rows) ---

describe('csv parse - 10,000 rows, 5 cols', () => {
  bench('@amigo-labs/csv (napi)', () => { amigoParse(buf10k) })
  if (wasmAmigoParse) bench('@amigo-labs/csv (wasm)', () => { wasmAmigoParse!(buf10k) })
  bench('@amigo-labs/csv (napi) (parseToJson)', () => { JSON.parse(amigoParseJson(buf10k)) })
  bench('csv-parse (sync)', () => { csvParseSyncFn(csv10k, { columns: true }) })
  bench('papaparse', () => { Papa.parse(csv10k, { header: true }) })
})

// --- parse (100k rows) ---

describe('csv parse - 100,000 rows, 10 cols', () => {
  bench('@amigo-labs/csv (napi)', () => { amigoParse(buf100k) }, { time: 10000, iterations: 3, warmupIterations: 1 })
  bench('@amigo-labs/csv (napi) (parseToJson)', () => { JSON.parse(amigoParseJson(buf100k)) }, { time: 10000, iterations: 3, warmupIterations: 1 })
  bench('csv-parse (sync)', () => { csvParseSyncFn(csv100k, { columns: true }) }, { time: 10000, iterations: 3, warmupIterations: 1 })
  bench('papaparse', () => { Papa.parse(csv100k, { header: true }) }, { time: 10000, iterations: 3, warmupIterations: 1 })
})
