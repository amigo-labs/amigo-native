import { bench, describe, beforeAll } from 'vitest'
import {
  xxh32 as amigoXxh32,
  xxh64 as amigoXxh64,
  xxh3_64 as amigoXxh3,
  xxh32Batch as amigoXxh32Batch,
  xxh3_64Batch as amigoXxh3Batch,
} from '../index.js'
import xxhashWasmInit from 'xxhash-wasm'
import XXHashJS from 'xxhashjs'

const buf64 = Buffer.alloc(64, 0xab)
const buf1m = Buffer.alloc(1_048_576, 0xab)

// Batch: 1000 small buffers (64 bytes each)
const batchInputs = Array.from({ length: 1000 }, (_, i) => {
  const b = Buffer.alloc(64)
  b.writeUInt32LE(i, 0)
  return b
})

let wasmHasher: Awaited<ReturnType<typeof xxhashWasmInit>>

beforeAll(async () => {
  wasmHasher = await xxhashWasmInit()
})

// --- Single: xxh32 ---

describe('xxh32 - 64 bytes', () => {
  bench('@amigo-labs/xxhash', () => { amigoXxh32(buf64) })
  bench('xxhash-wasm', () => { wasmHasher.h32Raw(buf64) })
  bench('xxhashjs', () => { XXHashJS.h32(buf64, 0).toNumber() })
})

describe('xxh32 - 1 MB', () => {
  bench('@amigo-labs/xxhash', () => { amigoXxh32(buf1m) })
  bench('xxhash-wasm', () => { wasmHasher.h32Raw(buf1m) })
  bench('xxhashjs', () => { XXHashJS.h32(buf1m, 0).toNumber() })
})

// --- Single: xxh64 ---

describe('xxh64 - 1 MB', () => {
  bench('@amigo-labs/xxhash', () => { amigoXxh64(buf1m) })
  bench('xxhash-wasm', () => { wasmHasher.h64Raw(buf1m) })
  bench('xxhashjs', () => { XXHashJS.h64(buf1m, 0).toString(16) })
})

// --- xxh3 ---

describe('xxh3_64 - 1 MB', () => {
  bench('@amigo-labs/xxhash (xxh3)', () => { amigoXxh3(buf1m) })
  bench('xxhash-wasm (h64)', () => { wasmHasher.h64Raw(buf1m) })
})

// --- Batch: 1000 × 64 bytes (amortized FFI overhead) ---

describe('xxh32 batch - 1000 × 64 bytes', () => {
  bench('@amigo-labs/xxhash (batch)', () => {
    amigoXxh32Batch(batchInputs)
  })
  bench('@amigo-labs/xxhash (loop)', () => {
    for (const buf of batchInputs) amigoXxh32(buf)
  })
  bench('xxhash-wasm (loop)', () => {
    for (const buf of batchInputs) wasmHasher.h32Raw(buf)
  })
  bench('xxhashjs (loop)', () => {
    for (const buf of batchInputs) XXHashJS.h32(buf, 0).toNumber()
  })
})

describe('xxh3_64 batch - 1000 × 64 bytes', () => {
  bench('@amigo-labs/xxhash (batch)', () => {
    amigoXxh3Batch(batchInputs)
  })
  bench('xxhash-wasm (loop)', () => {
    for (const buf of batchInputs) wasmHasher.h64Raw(buf)
  })
})
