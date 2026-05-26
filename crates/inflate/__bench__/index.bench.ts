import { bench, describe } from 'vitest'
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

describe('inflate — deflate 1KB text', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(small)
  })
  if (wasmAmigoDeflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(small) })
  bench('pako', () => {
    pako.deflate(small)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(small)
  })
})

describe('inflate — deflate 100KB text', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(mediumText)
  })
  if (wasmAmigoDeflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(mediumText) })
  bench('pako', () => {
    pako.deflate(mediumText)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(mediumText)
  })
})

describe('inflate — deflate 100KB random', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(mediumRandom)
  })
  if (wasmAmigoDeflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(mediumRandom) })
  bench('pako', () => {
    pako.deflate(mediumRandom)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(mediumRandom)
  })
})

describe('inflate — deflate 10MB text', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoDeflate(largeText)
  })
  if (wasmAmigoDeflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoDeflate!(largeText) })
  bench('pako', () => {
    pako.deflate(largeText)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(largeText)
  })
})

describe('inflate — inflate 1KB', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(smallDeflated)
  })
  if (wasmAmigoInflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(smallDeflated) })
  bench('pako', () => {
    pako.inflate(smallDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(smallDeflated)
  })
})

describe('inflate — inflate 100KB', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(mediumTextDeflated)
  })
  if (wasmAmigoInflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(mediumTextDeflated) })
  bench('pako', () => {
    pako.inflate(mediumTextDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(mediumTextDeflated)
  })
})

describe('inflate — inflate 10MB', () => {
  bench('@amigo-labs/inflate (napi)', () => {
    amigoInflate(largeTextDeflated)
  })
  if (wasmAmigoInflate) bench('@amigo-labs/inflate (wasm)', () => { wasmAmigoInflate!(largeTextDeflated) })
  bench('pako', () => {
    pako.inflate(largeTextDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(largeTextDeflated)
  })
})
