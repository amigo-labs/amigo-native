import { bench, describe } from 'vitest'
import { splitText as ours } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmOurs: typeof ours | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_text_splitters_wasm.js')
  wasmOurs = mod.splitText
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

const upstream = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
})

const SHORT = 'hello world '.repeat(20)
const MEDIUM = 'lorem ipsum dolor sit amet '.repeat(500)
const LONG = 'the quick brown fox jumps over the lazy dog. '.repeat(3000)

describe('short (~240 bytes)', () => {
  bench('@amigo-labs/text-splitters (napi) splitText', () => {
    ours(SHORT, { chunkSize: 1000, chunkOverlap: 200 })
  })
  if (wasmOurs) bench('@amigo-labs/text-splitters (wasm) splitText', () => { wasmOurs!(SHORT, { chunkSize: 1000, chunkOverlap: 200 }) })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(SHORT)
  })
})

describe('medium (~14 KB)', () => {
  bench('@amigo-labs/text-splitters (napi) splitText', () => {
    ours(MEDIUM, { chunkSize: 1000, chunkOverlap: 200 })
  })
  if (wasmOurs) bench('@amigo-labs/text-splitters (wasm) splitText', () => { wasmOurs!(MEDIUM, { chunkSize: 1000, chunkOverlap: 200 }) })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(MEDIUM)
  })
})

describe('long (~140 KB)', () => {
  bench('@amigo-labs/text-splitters (napi) splitText', () => {
    ours(LONG, { chunkSize: 1000, chunkOverlap: 200 })
  })
  if (wasmOurs) bench('@amigo-labs/text-splitters (wasm) splitText', () => { wasmOurs!(LONG, { chunkSize: 1000, chunkOverlap: 200 }) })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(LONG)
  })
})
