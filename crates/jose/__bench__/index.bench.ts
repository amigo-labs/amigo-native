import { test } from 'vitest'
import * as jose from 'jose'
import {
  generateEd25519KeyPair as amigoGenEd25519,
  jwkThumbprint as amigoThumbprint,
} from '../index.js'

const edJwk = (amigoGenEd25519() as { publicJwk: any }).publicJwk

// Pinned RSA-2048 JWK (RFC 7638 §3.1 test vector) — thumbprint works on
// any JWK, so the bench doesn't depend on an RSA-generation path.
const rsaJwk = {
  kty: 'RSA',
  n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
  e: 'AQAB',
}

test('jwkThumbprint - Ed25519', async ({ bench }) => {
  await bench(
    '@amigo-labs/jose',
    () => {
      amigoThumbprint(edJwk)
    },
    { time: 3000, warmupIterations: 10 },
  ).run()

  await bench(
    'jose (panva, pure JS)',
    async () => {
      await jose.calculateJwkThumbprint(edJwk, 'sha256')
    },
    { time: 3000, warmupIterations: 10 },
  ).run()
})

test('jwkThumbprint - RSA-2048', async ({ bench }) => {
  await bench(
    '@amigo-labs/jose',
    () => {
      amigoThumbprint(rsaJwk)
    },
    { time: 3000, warmupIterations: 10 },
  ).run()

  await bench(
    'jose (panva, pure JS)',
    async () => {
      await jose.calculateJwkThumbprint(rsaJwk, 'sha256')
    },
    { time: 3000, warmupIterations: 10 },
  ).run()
})

test('generateEd25519KeyPair', async ({ bench }) => {
  await bench(
    '@amigo-labs/jose',
    () => {
      amigoGenEd25519()
    },
    { time: 3000, warmupIterations: 5 },
  ).run()

  await bench(
    'jose (panva, pure JS) — generateKeyPair Ed25519 + exportJWK',
    async () => {
      const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', {
        extractable: true,
      })
      await jose.exportJWK(publicKey)
      await jose.exportJWK(privateKey)
    },
    { time: 3000, warmupIterations: 2 },
  ).run()
})
