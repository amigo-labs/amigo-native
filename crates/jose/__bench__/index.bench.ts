import { bench, describe, beforeAll } from 'vitest'
import * as jose from 'jose'
import {
  generateEd25519KeyPair as amigoGenEd25519,
  generateRsaKeyPair as amigoGenRsa,
  jwkThumbprint as amigoThumbprint,
} from '../index.js'

let edJwk: any
let rsaJwk: any

beforeAll(async () => {
  edJwk = (amigoGenEd25519() as { publicJwk: any }).publicJwk
  rsaJwk = ((await amigoGenRsa(2048)) as { publicJwk: any }).publicJwk
}, 30_000)

describe('jwkThumbprint - Ed25519', () => {
  bench(
    '@amigo-labs/jose',
    () => {
      amigoThumbprint(edJwk)
    },
    { time: 3000, warmupIterations: 10 },
  )

  bench(
    'jose (panva, pure JS)',
    async () => {
      await jose.calculateJwkThumbprint(edJwk, 'sha256')
    },
    { time: 3000, warmupIterations: 10 },
  )
})

describe('jwkThumbprint - RSA-2048', () => {
  bench(
    '@amigo-labs/jose',
    () => {
      amigoThumbprint(rsaJwk)
    },
    { time: 3000, warmupIterations: 10 },
  )

  bench(
    'jose (panva, pure JS)',
    async () => {
      await jose.calculateJwkThumbprint(rsaJwk, 'sha256')
    },
    { time: 3000, warmupIterations: 10 },
  )
})

describe('generateEd25519KeyPair', () => {
  bench(
    '@amigo-labs/jose',
    () => {
      amigoGenEd25519()
    },
    { time: 3000, warmupIterations: 5 },
  )

  bench(
    'jose (panva, pure JS) — generateKeyPair Ed25519 + exportJWK',
    async () => {
      const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', {
        extractable: true,
      })
      await jose.exportJWK(publicKey)
      await jose.exportJWK(privateKey)
    },
    { time: 3000, warmupIterations: 2 },
  )
})

describe('generateRsaKeyPair (2048-bit) — slow, low iteration', () => {
  bench(
    '@amigo-labs/jose',
    async () => {
      await amigoGenRsa(2048)
    },
    { time: 30_000, iterations: 3, warmupIterations: 1 },
  )

  bench(
    'jose (panva, pure JS) — generateKeyPair RSA + exportJWK',
    async () => {
      const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
        extractable: true,
        modulusLength: 2048,
      })
      await jose.exportJWK(publicKey)
      await jose.exportJWK(privateKey)
    },
    { time: 30_000, iterations: 3, warmupIterations: 1 },
  )
})
