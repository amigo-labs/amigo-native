import { bench, describe, beforeAll } from 'vitest'
import {
  xxh32 as amigoXxh32,
  xxh64 as amigoXxh64,
  xxh3_64 as amigoXxh3,
  xxh32Many as amigoXxh32Many,
  xxh3_64Many as amigoXxh3Many,
  Xxh32Hasher,
  Xxh3Hasher,
} from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmAmigoXxh32: typeof amigoXxh32 | null = null
let wasmAmigoXxh64: typeof amigoXxh64 | null = null
let wasmAmigoXxh3: typeof amigoXxh3 | null = null
let wasmAmigoXxh32Many: typeof amigoXxh32Many | null = null
let wasmAmigoXxh3Many: typeof amigoXxh3Many | null = null
let wasmXxh32Hasher: typeof Xxh32Hasher | null = null
let wasmXxh3Hasher: typeof Xxh3Hasher | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_xxhash_wasm.js')
  wasmAmigoXxh32 = mod.xxh32
  wasmAmigoXxh64 = mod.xxh64
  wasmAmigoXxh3 = mod.xxh3_64
  wasmAmigoXxh32Many = mod.xxh32Many
  wasmAmigoXxh3Many = mod.xxh3_64Many
  wasmXxh32Hasher = mod.Xxh32Hasher
  wasmXxh3Hasher = mod.Xxh3Hasher
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import xxhashWasmInit from 'xxhash-wasm'
import XXHashJS from 'xxhashjs'

const buf64 = Buffer.alloc(64, 0xab)
const buf1m = Buffer.alloc(1_048_576, 0xab)

// Batch fixture: 1000 × 64 bytes packed into one contiguous buffer so
// `xxh*Many` can consume it without paying for 1000 separate FFI trips.
const batchPacked = Buffer.alloc(1000 * 64)
for (let i = 0; i < 1000; i++) batchPacked.writeUInt32LE(i, i * 64)

// Legacy Vec<Buffer> fixture for comparison benches (JS-loop path).
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
  bench('@amigo-labs/xxhash (napi)', () => { amigoXxh32(buf64) })
  if (wasmAmigoXxh32) bench('@amigo-labs/xxhash (wasm)', () => { wasmAmigoXxh32!(buf64) })
  bench('xxhash-wasm', () => { wasmHasher.h32Raw(buf64) })
  bench('xxhashjs', () => { XXHashJS.h32(buf64, 0).toNumber() })
})

describe('xxh32 - 1 MB', () => {
  bench('@amigo-labs/xxhash (napi)', () => { amigoXxh32(buf1m) })
  if (wasmAmigoXxh32) bench('@amigo-labs/xxhash (wasm)', () => { wasmAmigoXxh32!(buf1m) })
  bench('xxhash-wasm', () => { wasmHasher.h32Raw(buf1m) })
  bench('xxhashjs', () => { XXHashJS.h32(buf1m, 0).toNumber() })
})

// --- Single: xxh64 ---

describe('xxh64 - 1 MB', () => {
  bench('@amigo-labs/xxhash (napi)', () => { amigoXxh64(buf1m) })
  if (wasmAmigoXxh64) bench('@amigo-labs/xxhash (wasm)', () => { wasmAmigoXxh64!(buf1m) })
  bench('xxhash-wasm', () => { wasmHasher.h64Raw(buf1m) })
  bench('xxhashjs', () => { XXHashJS.h64(buf1m, 0).toString(16) })
})

// --- xxh3 ---

describe('xxh3_64 - 1 MB', () => {
  bench('@amigo-labs/xxhash (napi) (xxh3)', () => { amigoXxh3(buf1m) })
  if (wasmAmigoXxh3) bench('@amigo-labs/xxhash (wasm) (xxh3)', () => { wasmAmigoXxh3!(buf1m) })
  bench('xxhash-wasm (h64)', () => { wasmHasher.h64Raw(buf1m) })
})

// --- Batch: 1000 × 64 bytes (amortized FFI overhead) ---

describe('xxh32 batch - 1000 × 64 bytes', () => {
  bench('@amigo-labs/xxhash (napi) (many, Buffer in/out)', () => {
    amigoXxh32Many(batchPacked, 64)
  })
  if (wasmAmigoXxh32Many) bench('@amigo-labs/xxhash (wasm) (many, Buffer in/out)', () => { wasmAmigoXxh32Many!(batchPacked, 64) })
  bench('@amigo-labs/xxhash (napi) (loop)', () => {
    for (const buf of batchInputs) amigoXxh32(buf)
  })
  bench('@amigo-labs/xxhash (napi) (streaming)', () => {
    const h = new Xxh32Hasher()
    for (const buf of batchInputs) h.update(buf)
    h.digest()
  })
  bench('xxhash-wasm (loop)', () => {
    for (const buf of batchInputs) wasmHasher.h32Raw(buf)
  })
  bench('xxhashjs (loop)', () => {
    for (const buf of batchInputs) XXHashJS.h32(buf, 0).toNumber()
  })
})

describe('xxh3_64 batch - 1000 × 64 bytes', () => {
  bench('@amigo-labs/xxhash (napi) (many, Buffer in/out)', () => {
    amigoXxh3Many(batchPacked, 64)
  })
  if (wasmAmigoXxh3Many) bench('@amigo-labs/xxhash (wasm) (many, Buffer in/out)', () => { wasmAmigoXxh3Many!(batchPacked, 64) })
  bench('@amigo-labs/xxhash (napi) (streaming)', () => {
    const h = new Xxh3Hasher()
    for (const buf of batchInputs) h.update(buf)
    h.digest()
  })
  bench('xxhash-wasm (loop)', () => {
    for (const buf of batchInputs) wasmHasher.h64Raw(buf)
  })
})
