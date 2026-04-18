import { bench, describe } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = require('../index.js')

const small = 'x'.repeat(10) // 10 B
const medium = 'x'.repeat(1024) // 1 KB
const large = 'x'.repeat(100 * 1024) // 100 KB

const bufSmall = Buffer.alloc(1024)
const bufMedium = Buffer.alloc(100 * 1024)
const bufLarge = Buffer.alloc(10 * 1024 * 1024)

const arrSmall = Array.from({ length: 10 }, (_, i) => i)
const arrMedium = Array.from({ length: 1000 }, (_, i) => i)
const arrLarge = Array.from({ length: 100_000 }, (_, i) => i)

describe('ffi — noop (pure call overhead)', () => {
  bench('noop', () => {
    native.noop()
  })
})

describe('ffi — echoString (UTF-16 ↔ UTF-8 conversion)', () => {
  bench('echoString 10B', () => {
    native.echoString(small)
  })
  bench('echoString 1KB', () => {
    native.echoString(medium)
  })
  bench('echoString 100KB', () => {
    native.echoString(large)
  })
})

describe('ffi — echoBuffer (zero-copy)', () => {
  bench('echoBuffer 1KB', () => {
    native.echoBuffer(bufSmall)
  })
  bench('echoBuffer 100KB', () => {
    native.echoBuffer(bufMedium)
  })
  bench('echoBuffer 10MB', () => {
    native.echoBuffer(bufLarge)
  })
})

describe('ffi — sumArray (array marshalling)', () => {
  bench('sumArray 10', () => {
    native.sumArray(arrSmall)
  })
  bench('sumArray 1000', () => {
    native.sumArray(arrMedium)
  })
  bench('sumArray 100000', () => {
    native.sumArray(arrLarge)
  })
})
