import { bench, describe } from 'vitest'
import { deflate as amigoDeflate, inflate as amigoInflate } from '../index.js'
import pako from 'pako'
import * as zlib from 'node:zlib'

function makeBuffer(size: number, compressible: boolean): Buffer {
  const b = Buffer.alloc(size)
  if (compressible) {
    const word = 'amigo-native '
    for (let i = 0; i < size; i++) b[i] = word.charCodeAt(i % word.length)
  } else {
    for (let i = 0; i < size; i++) b[i] = (i * 2654435761) & 0xff
  }
  return b
}

const small = makeBuffer(1024, true)
const mediumText = makeBuffer(100 * 1024, true)
const mediumRandom = makeBuffer(100 * 1024, false)
const largeText = makeBuffer(10 * 1024 * 1024, true)

const smallDeflated = amigoDeflate(small)
const mediumTextDeflated = amigoDeflate(mediumText)
const largeTextDeflated = amigoDeflate(largeText)

describe('inflate — deflate 1KB text', () => {
  bench('@amigo-labs/inflate', () => {
    amigoDeflate(small)
  })
  bench('pako', () => {
    pako.deflate(small)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(small)
  })
})

describe('inflate — deflate 100KB text', () => {
  bench('@amigo-labs/inflate', () => {
    amigoDeflate(mediumText)
  })
  bench('pako', () => {
    pako.deflate(mediumText)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(mediumText)
  })
})

describe('inflate — deflate 100KB random', () => {
  bench('@amigo-labs/inflate', () => {
    amigoDeflate(mediumRandom)
  })
  bench('pako', () => {
    pako.deflate(mediumRandom)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(mediumRandom)
  })
})

describe('inflate — deflate 10MB text', () => {
  bench('@amigo-labs/inflate', () => {
    amigoDeflate(largeText)
  })
  bench('pako', () => {
    pako.deflate(largeText)
  })
  bench('node:zlib', () => {
    zlib.deflateSync(largeText)
  })
})

describe('inflate — inflate 1KB', () => {
  bench('@amigo-labs/inflate', () => {
    amigoInflate(smallDeflated)
  })
  bench('pako', () => {
    pako.inflate(smallDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(smallDeflated)
  })
})

describe('inflate — inflate 100KB', () => {
  bench('@amigo-labs/inflate', () => {
    amigoInflate(mediumTextDeflated)
  })
  bench('pako', () => {
    pako.inflate(mediumTextDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(mediumTextDeflated)
  })
})

describe('inflate — inflate 10MB', () => {
  bench('@amigo-labs/inflate', () => {
    amigoInflate(largeTextDeflated)
  })
  bench('pako', () => {
    pako.inflate(largeTextDeflated)
  })
  bench('node:zlib', () => {
    zlib.inflateSync(largeTextDeflated)
  })
})
