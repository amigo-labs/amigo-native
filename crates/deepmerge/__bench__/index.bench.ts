import { bench, describe } from 'vitest'
import amigoMerge from '../wrapper.js'
import upstream from 'deepmerge'

function makeFlat(): { a: number; b: string; c: boolean; d: number } {
  return { a: 1, b: 'x', c: true, d: 3.14 }
}

function makeNested(depth: number): Record<string, unknown> {
  let o: Record<string, unknown> = { v: 1 }
  for (let i = 0; i < depth; i++) o = { ['k' + i]: o }
  return o
}

const flatA = makeFlat()
const flatB = { b: 'y', e: 5 }

const deepA = makeNested(10)
const deepB = makeNested(10)

function makeArray(n: number): Record<string, unknown> {
  const l: unknown[] = []
  for (let i = 0; i < n; i++) l.push({ id: i, v: i * 2 })
  return { items: l }
}

const arrA = makeArray(1000)
const arrB = makeArray(1000)

describe('deepmerge — flat 4-key objects', () => {
  bench('@amigo-labs/deepmerge', () => {
    amigoMerge(flatA, flatB)
  })
  bench('deepmerge', () => {
    upstream(flatA, flatB)
  })
})

describe('deepmerge — deep (10 levels)', () => {
  bench('@amigo-labs/deepmerge', () => {
    amigoMerge(deepA, deepB)
  })
  bench('deepmerge', () => {
    upstream(deepA, deepB)
  })
})

describe('deepmerge — 1000 items arrays', () => {
  bench('@amigo-labs/deepmerge', () => {
    amigoMerge(arrA, arrB)
  })
  bench('deepmerge', () => {
    upstream(arrA, arrB)
  })
})
