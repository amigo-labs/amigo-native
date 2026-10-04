import { test } from 'vitest'
import { deflate as amigoDeflate, inflate as amigoInflate } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmAmigoDeflate: typeof amigoDeflate | null = null
let wasmAmigoInflate: typeof amigoInflate | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_inflate_wasm.js')
  wasmAmigoDeflate = mod.deflate
  wasmAmigoInflate = mod.inflate
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import pako from 'pako'
import * as zlib from 'node:zlib'

function makeBuffer(size: number, compressible: boolean): Buffer {
  const b = Buffer.alloc(size)
  if (compressible) {
    const word = 'amigo-native '
    for (let i = 0; i < size; i++) b[i] = word.charCodeAt(i % word.length)
  } else {
    for (let i = 0; i < size; i++) b[i] = (i * 2654435761) & 0xff
  }
  return b
}

const small = makeBuffer(1024, true)
const mediumText = makeBuffer(100 * 1024, true)
const mediumRandom = makeBuffer(100 * 1024, false)
const largeText = makeBuffer(10 * 1024 * 1024, true)

const smallDeflated = amigoDeflate(small)
const mediumTextDeflated = amigoDeflate(mediumText)
const largeTextDeflated = amigoDeflate(largeText)

test('inflate — deflate 1KB text', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(small)
  }).run()
  if (wasmAmigoDeflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(small) }).run()
  await bench('pako', () => {
    pako.deflate(small)
  }).run()
  await bench('node:zlib', () => {
    zlib.deflateSync(small)
  }).run()
})

test('inflate — deflate 100KB text', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(mediumText)
  }).run()
  if (wasmAmigoDeflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(mediumText) }).run()
  await bench('pako', () => {
    pako.deflate(mediumText)
  }).run()
  await bench('node:zlib', () => {
    zlib.deflateSync(mediumText)
  }).run()
})

test('inflate — deflate 100KB random', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(mediumRandom)
  }).run()
  if (wasmAmigoDeflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(mediumRandom) }).run()
  await bench('pako', () => {
    pako.deflate(mediumRandom)
  }).run()
  await bench('node:zlib', () => {
    zlib.deflateSync(mediumRandom)
  }).run()
})

test('inflate — deflate 10MB text', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(largeText)
  }).run()
  if (wasmAmigoDeflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(largeText) }).run()
  await bench('pako', () => {
    pako.deflate(largeText)
  }).run()
  await bench('node:zlib', () => {
    zlib.deflateSync(largeText)
  }).run()
})

test('inflate — inflate 1KB', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(smallDeflated)
  }).run()
  if (wasmAmigoInflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(smallDeflated) }).run()
  await bench('pako', () => {
    pako.inflate(smallDeflated)
  }).run()
  await bench('node:zlib', () => {
    zlib.inflateSync(smallDeflated)
  }).run()
})

test('inflate — inflate 100KB', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(mediumTextDeflated)
  }).run()
  if (wasmAmigoInflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(mediumTextDeflated) }).run()
  await bench('pako', () => {
    pako.inflate(mediumTextDeflated)
  }).run()
  await bench('node:zlib', () => {
    zlib.inflateSync(mediumTextDeflated)
  }).run()
})

test('inflate — inflate 10MB', async ({ bench }) => {
  await bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(largeTextDeflated)
  }).run()
  if (wasmAmigoInflate) await bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(largeTextDeflated) }).run()
  await bench('pako', () => {
    pako.inflate(largeTextDeflated)
  }).run()
  await bench('node:zlib', () => {
    zlib.inflateSync(largeTextDeflated)
  }).run()
})
