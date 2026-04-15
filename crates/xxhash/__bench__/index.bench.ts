import { bench, describe, beforeAll } from 'vitest'
import { xxh32 as amigoXxh32, xxh64 as amigoXxh64, xxh3_64 as amigoXxh3 } from '../index.js'
import xxhashWasmInit from 'xxhash-wasm'
import XXHashJS from 'xxhashjs'

const buf64 = Buffer.alloc(64, 0xab)
const buf1k = Buffer.alloc(1024, 0xab)
const buf1m = Buffer.alloc(1_048_576, 0xab)

let wasmHasher: Awaited<ReturnType<typeof xxhashWasmInit>>

beforeAll(async () => {
  wasmHasher = await xxhashWasmInit()
})

// --- xxh32 ---

describe('xxh32 - 64 bytes', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh32(buf64)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h32Raw(buf64)
  })
  bench('xxhashjs', () => {
    XXHashJS.h32(buf64, 0).toNumber()
  })
})

describe('xxh32 - 1 KB', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh32(buf1k)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h32Raw(buf1k)
  })
  bench('xxhashjs', () => {
    XXHashJS.h32(buf1k, 0).toNumber()
  })
})

describe('xxh32 - 1 MB', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh32(buf1m)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h32Raw(buf1m)
  })
  bench('xxhashjs', () => {
    XXHashJS.h32(buf1m, 0).toNumber()
  })
})

// --- xxh64 ---

describe('xxh64 - 64 bytes', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh64(buf64)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h64Raw(buf64)
  })
  bench('xxhashjs', () => {
    XXHashJS.h64(buf64, 0).toString(16)
  })
})

describe('xxh64 - 1 KB', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh64(buf1k)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h64Raw(buf1k)
  })
  bench('xxhashjs', () => {
    XXHashJS.h64(buf1k, 0).toString(16)
  })
})

describe('xxh64 - 1 MB', () => {
  bench('@amigo-labs/xxhash', () => {
    amigoXxh64(buf1m)
  })
  bench('xxhash-wasm', () => {
    wasmHasher.h64Raw(buf1m)
  })
  bench('xxhashjs', () => {
    XXHashJS.h64(buf1m, 0).toString(16)
  })
})

// --- xxh3 (only amigo + xxhash-wasm) ---

describe('xxh3_64 - 1 MB', () => {
  bench('@amigo-labs/xxhash (xxh3)', () => {
    amigoXxh3(buf1m)
  })
  bench('xxhash-wasm (h64)', () => {
    wasmHasher.h64Raw(buf1m)
  })
})
