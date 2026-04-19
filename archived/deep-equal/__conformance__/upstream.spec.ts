/**
 * Parity tests against fast-deep-equal@3 and fast-deep-equal/es6.
 */
import { describe, it, expect } from 'vitest'
import amigoEqual from '../wrapper.js'
import fastEqual from 'fast-deep-equal'
import fastEqualEs6 from 'fast-deep-equal/es6'

const PAIRS: Array<[string, unknown, unknown]> = [
  ['primitives-equal-1', 1, 1],
  ['primitives-equal-2', 'a', 'a'],
  ['primitives-unequal-1', 1, 2],
  ['primitives-unequal-2', 1, '1'],
  ['null-undefined', null, undefined],
  ['null-null', null, null],
  ['nan-nan', NaN, NaN],
  ['arr-equal', [1, 2, 3], [1, 2, 3]],
  ['arr-unequal-length', [1, 2, 3], [1, 2]],
  ['arr-unequal-order', [1, 2, 3], [3, 2, 1]],
  ['obj-equal-reordered', { a: 1, b: 2 }, { b: 2, a: 1 }],
  ['obj-unequal-missing-key', { a: 1 }, { a: 1, b: undefined }],
  ['nested-equal', { a: [1, { b: [2, 3] }] }, { a: [1, { b: [2, 3] }] }],
  ['nested-unequal', { a: [1, { b: [2, 3] }] }, { a: [1, { b: [2, 4] }] }],
  ['date-equal', new Date(2024, 0, 1), new Date(2024, 0, 1)],
  ['date-unequal', new Date(2024, 0, 1), new Date(2024, 0, 2)],
  ['regexp-equal', /abc/gi, /abc/gi],
  ['regexp-unequal', /abc/g, /abc/i],
]

const ES6_PAIRS: Array<[string, unknown, unknown]> = [
  ['map-equal', new Map([['a', 1]]), new Map([['a', 1]])],
  ['map-unequal', new Map([['a', 1]]), new Map([['a', 2]])],
  ['set-equal', new Set([1, 2, 3]), new Set([3, 2, 1])],
  ['set-unequal', new Set([1, 2]), new Set([1, 3])],
  ['uint8array-equal', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])],
]

describe('deep-equal — parity with fast-deep-equal', () => {
  for (const [label, a, b] of PAIRS) {
    it(label, () => {
      expect(amigoEqual(a, b)).toBe(fastEqual(a, b))
    })
  }
})

describe('deep-equal — parity with fast-deep-equal/es6', () => {
  for (const [label, a, b] of ES6_PAIRS) {
    it(label, () => {
      expect(amigoEqual(a, b)).toBe(fastEqualEs6(a, b))
    })
  }
})
