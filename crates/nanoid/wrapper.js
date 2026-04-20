'use strict'

// Pure-JS nanoid implementation. Built on Node's native `crypto.randomFillSync`
// with a pool that amortises entropy syscalls across 128 IDs — same strategy
// as nanoid@5. The Rust/NAPI route was removed in 0.2.0 because the FFI
// boundary (~1.5µs per call) was bigger than the entire JS path takes to
// generate a 21-char ID, so the native binding could only ever slow things
// down for the common case.

const { randomFillSync } = require('node:crypto')

// Matches nanoid@5's `urlAlphabet` byte-for-byte so callers can swap
// between the two without any visible difference in output shape.
const URL_ALPHABET =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

// 128 IDs worth of entropy per refill — one `randomFillSync` syscall
// serves ~128 `nanoid()` calls with the default 21-byte size.
const POOL_SIZE_MULTIPLIER = 128
const DEFAULT_SIZE = 21

let pool = null
let poolOffset = 0

function fillPool(bytes) {
  if (!pool || pool.length < bytes) {
    pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER)
    randomFillSync(pool)
    poolOffset = 0
  } else if (poolOffset + bytes > pool.length) {
    randomFillSync(pool)
    poolOffset = 0
  }
  poolOffset += bytes
}

function random(bytes) {
  bytes |= 0
  fillPool(bytes)
  return pool.subarray(poolOffset - bytes, poolOffset)
}

function nanoid(size = DEFAULT_SIZE) {
  size |= 0
  if (!size) return ''
  fillPool(size)
  let id = ''
  // The URL-safe alphabet is 64 chars — a power of two, so `byte & 63` is
  // a uniform index. No rejection sampling needed.
  for (let i = poolOffset - size; i < poolOffset; i++) {
    id += URL_ALPHABET[pool[i] & 63]
  }
  return id
}

function customRandom(alphabet, defaultSize) {
  // `Array.from` splits on Unicode grapheme code-points so a multi-byte
  // alphabet char ends up as one element.
  const chars = Array.from(alphabet)
  const alphaLen = chars.length
  const safeByteCutoff = 256 - (256 % alphaLen)
  // Power-of-two alphabet: mask + index, no rejection needed.
  if (safeByteCutoff === 256) {
    const mask = alphaLen - 1
    return function (size) {
      size = size === undefined ? defaultSize : size | 0
      if (!size) return ''
      let id = ''
      while (true) {
        const bytes = random(size)
        for (let i = 0; i < size; i++) {
          id += chars[bytes[i] & mask]
          if (id.length === size) return id
        }
      }
    }
  }
  // Non-power-of-two alphabet: rejection sampling. Step-size heuristic
  // from nanoid@5 — ~1.6× enough to not loop twice on average.
  const step = Math.ceil((1.6 * 256 * defaultSize) / safeByteCutoff)
  return function (size) {
    size = size === undefined ? defaultSize : size | 0
    if (!size) return ''
    let id = ''
    while (true) {
      const bytes = random(step)
      for (let i = 0; i < step; i++) {
        if (bytes[i] < safeByteCutoff) {
          id += chars[bytes[i] % alphaLen]
          if (id.length === size) return id
        }
      }
    }
  }
}

function customAlphabet(alphabet, defaultSize = DEFAULT_SIZE) {
  if (typeof alphabet !== 'string' || alphabet.length === 0) {
    throw new TypeError('customAlphabet: alphabet must be a non-empty string')
  }
  return customRandom(alphabet, defaultSize)
}

function nanoidCustom(alphabet, size = DEFAULT_SIZE) {
  if (typeof alphabet !== 'string' || alphabet.length === 0) {
    throw new TypeError('alphabet must not be empty')
  }
  return customRandom(alphabet, size)(size)
}

function nanoidBatch(count, size = DEFAULT_SIZE) {
  count |= 0
  const out = Array.from({ length: count })
  for (let i = 0; i < count; i++) out[i] = nanoid(size)
  return out
}

function nanoidCustomBatch(alphabet, count, size = DEFAULT_SIZE) {
  if (typeof alphabet !== 'string' || alphabet.length === 0) {
    throw new TypeError('alphabet must not be empty')
  }
  count |= 0
  const gen = customRandom(alphabet, size)
  const out = Array.from({ length: count })
  for (let i = 0; i < count; i++) out[i] = gen(size)
  return out
}

module.exports = {
  nanoid,
  nanoidCustom,
  nanoidBatch,
  nanoidCustomBatch,
  customAlphabet,
}
module.exports.default = module.exports
