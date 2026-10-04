import { test } from 'vitest'
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

test('ffi — noop (pure call overhead)', async ({ bench }) => {
  await bench('noop', () => {
    native.noop()
  }).run()
})

test('ffi — echoString (UTF-16 ↔ UTF-8 conversion)', async ({ bench }) => {
  await bench('echoString 10B', () => {
    native.echoString(small)
  }).run()
  await bench('echoString 1KB', () => {
    native.echoString(medium)
  }).run()
  await bench('echoString 100KB', () => {
    native.echoString(large)
  }).run()
})

test('ffi — echoBuffer (zero-copy)', async ({ bench }) => {
  await bench('echoBuffer 1KB', () => {
    native.echoBuffer(bufSmall)
  }).run()
  await bench('echoBuffer 100KB', () => {
    native.echoBuffer(bufMedium)
  }).run()
  await bench('echoBuffer 10MB', () => {
    native.echoBuffer(bufLarge)
  }).run()
})

test('ffi — sumArray (array marshalling)', async ({ bench }) => {
  await bench('sumArray 10', () => {
    native.sumArray(arrSmall)
  }).run()
  await bench('sumArray 1000', () => {
    native.sumArray(arrMedium)
  }).run()
  await bench('sumArray 100000', () => {
    native.sumArray(arrLarge)
  }).run()
})
