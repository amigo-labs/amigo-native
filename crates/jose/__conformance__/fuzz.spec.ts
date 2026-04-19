import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import * as jose from 'jose'
import { generateEd25519KeyPair, jwkThumbprint } from '../index.js'

// Property: any Ed25519 JWK we generate produces a thumbprint identical
// to panva/jose's calculation. Keep run count low — JWK gen is cheap but
// we don't want bench-scale runs in conformance.

describe('jose thumbprint property tests', () => {
  it('Ed25519: our thumbprint == panva/jose thumbprint for any generated JWK', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async () => {
        const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
        const ours = jwkThumbprint(publicJwk)
        const theirs = await jose.calculateJwkThumbprint(publicJwk, 'sha256')
        return ours === theirs
      }),
      { numRuns: 50, seed: 42 },
    )
  })

  it('thumbprint of public and private JWK from the same Ed25519 key are equal', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async () => {
        const { publicJwk, privateJwk } = generateEd25519KeyPair() as {
          publicJwk: any
          privateJwk: any
        }
        return jwkThumbprint(publicJwk) === jwkThumbprint(privateJwk)
      }),
      { numRuns: 50, seed: 42 },
    )
  })

  it('thumbprint rejects malformed JWKs', () => {
    fc.assert(
      fc.property(
        fc.anything().filter(
          (v) =>
            typeof v !== 'object' ||
            v === null ||
            !(v as any).kty ||
            typeof (v as any).kty !== 'string',
        ),
        (junk) => {
          expect(() => jwkThumbprint(junk as any)).toThrow()
        },
      ),
      { numRuns: 50, seed: 42 },
    )
  })
})
