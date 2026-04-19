import { bench, describe } from 'vitest'
import { get as amigoGet } from '../index.js'
import fastLev from 'fast-levenshtein'
import leven from 'leven'

function makeString(n: number, salt: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += String.fromCharCode(97 + ((i * 31 + salt) % 26))
  return s
}

const short1 = makeString(10, 1)
const short2 = makeString(10, 7)
const medium1 = makeString(100, 1)
const medium2 = makeString(100, 7)
const long1 = makeString(1000, 1)
const long2 = makeString(1000, 7)
const xlong1 = makeString(10_000, 1)
const xlong2 = makeString(10_000, 7)

describe('levenshtein — 10 chars', () => {
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(short1, short2)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(short1, short2)
  })
  bench('leven', () => {
    leven(short1, short2)
  })
})

describe('levenshtein — 100 chars', () => {
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(medium1, medium2)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(medium1, medium2)
  })
  bench('leven', () => {
    leven(medium1, medium2)
  })
})

describe('levenshtein — 1000 chars', () => {
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(long1, long2)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(long1, long2)
  })
  bench('leven', () => {
    leven(long1, long2)
  })
})

describe('levenshtein — 10000 chars', () => {
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(xlong1, xlong2)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(xlong1, xlong2)
  })
  bench('leven', () => {
    leven(xlong1, xlong2)
  })
})

// Asymmetric pairs surface a pathological case in the triple_accel SIMD
// banded path: on 100×5000 the current implementation is ~19× slower than
// a plain scalar DP. Kept as evidence — see docs/post-mortems/levenshtein.md.
describe('levenshtein — asymmetric 10×500 (query vs long candidate)', () => {
  const query = makeString(10, 1)
  const cand = makeString(500, 7)
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(query, cand)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(query, cand)
  })
})

describe('levenshtein — asymmetric 100×5000 (long query vs xlong candidate)', () => {
  const query = makeString(100, 1)
  const cand = makeString(5000, 7)
  bench('@amigo-labs/levenshtein', () => {
    amigoGet(query, cand)
  })
  bench('fast-levenshtein', () => {
    fastLev.get(query, cand)
  })
})
