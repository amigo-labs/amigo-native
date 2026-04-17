import { bench, describe } from 'vitest'
import amigoEqual from '../wrapper.js'
import fastEqual from 'fast-deep-equal'

const flatA = { a: 1, b: 'hello', c: true, d: null, e: 3.14, f: 'world', g: 42 }
const flatB = { a: 1, b: 'hello', c: true, d: null, e: 3.14, f: 'world', g: 42 }

function makeNested(depth: number): Record<string, unknown> {
  let o: Record<string, unknown> = { v: 1 }
  for (let i = 0; i < depth; i++) o = { ['k' + i]: o }
  return o
}
const deepA = makeNested(20)
const deepB = makeNested(20)

function makeArray(n: number): unknown[] {
  const out: unknown[] = []
  for (let i = 0; i < n; i++) out.push({ id: i, name: 'x' + i, meta: { a: i, b: i * 2 } })
  return out
}
const arrA = makeArray(10_000)
const arrB = makeArray(10_000)

describe('deep-equal — flat 7-key objects', () => {
  bench('@amigo-labs/deep-equal', () => {
    amigoEqual(flatA, flatB)
  })
  bench('fast-deep-equal', () => {
    fastEqual(flatA, flatB)
  })
})

describe('deep-equal — deeply nested (20 levels)', () => {
  bench('@amigo-labs/deep-equal', () => {
    amigoEqual(deepA, deepB)
  })
  bench('fast-deep-equal', () => {
    fastEqual(deepA, deepB)
  })
})

describe('deep-equal — 10k objects in array', () => {
  bench('@amigo-labs/deep-equal', () => {
    amigoEqual(arrA, arrB)
  })
  bench('fast-deep-equal', () => {
    fastEqual(arrA, arrB)
  })
})
