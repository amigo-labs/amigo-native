import { bench, describe } from 'vitest'
import { nanoid as amigoNanoid, customAlphabet as amigoCustomAlphabet } from '../wrapper.js'
import { nanoid as upstreamNanoid, customAlphabet as upstreamCustomAlphabet } from 'nanoid'
import { randomUUID } from 'node:crypto'

const amigoFactory = amigoCustomAlphabet('0123456789abcdef', 32)
const upstreamFactory = upstreamCustomAlphabet('0123456789abcdef', 32)

describe('nanoid — single call (default size)', () => {
  bench('@amigo-labs/nanoid', () => {
    amigoNanoid()
  })
  bench('nanoid', () => {
    upstreamNanoid()
  })
  bench('crypto.randomUUID', () => {
    randomUUID()
  })
})

describe('nanoid — batch 1000 × default', () => {
  bench('@amigo-labs/nanoid', () => {
    for (let i = 0; i < 1000; i++) amigoNanoid()
  })
  bench('nanoid', () => {
    for (let i = 0; i < 1000; i++) upstreamNanoid()
  })
  bench('crypto.randomUUID', () => {
    for (let i = 0; i < 1000; i++) randomUUID()
  })
})

describe('nanoid — customAlphabet (hex, 32 chars)', () => {
  bench('@amigo-labs/nanoid', () => {
    amigoFactory()
  })
  bench('nanoid', () => {
    upstreamFactory()
  })
})

describe('nanoid — single call size=128', () => {
  bench('@amigo-labs/nanoid', () => {
    amigoNanoid(128)
  })
  bench('nanoid', () => {
    upstreamNanoid(128)
  })
})
