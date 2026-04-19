import { describe, it, expect } from 'vitest'
import {
  generateEd25519KeyPair,
  generateRsaKeyPair,
  jwkThumbprint,
} from '../index.js'

describe('generateEd25519KeyPair', () => {
  it('returns a valid OKP/Ed25519 JWK pair', () => {
    const { publicJwk, privateJwk } = generateEd25519KeyPair() as {
      publicJwk: any
      privateJwk: any
    }
    expect(publicJwk.kty).toBe('OKP')
    expect(publicJwk.crv).toBe('Ed25519')
    expect(typeof publicJwk.x).toBe('string')
    expect(privateJwk.kty).toBe('OKP')
    expect(privateJwk.crv).toBe('Ed25519')
    expect(privateJwk.x).toBe(publicJwk.x)
    expect(typeof privateJwk.d).toBe('string')
    // d (private scalar) should not be present in the public JWK
    expect(publicJwk.d).toBeUndefined()
  })

  it('produces distinct keys on consecutive calls', () => {
    const a = generateEd25519KeyPair() as { publicJwk: any }
    const b = generateEd25519KeyPair() as { publicJwk: any }
    expect(a.publicJwk.x).not.toBe(b.publicJwk.x)
  })
})

describe('generateRsaKeyPair', () => {
  it('returns a valid RSA JWK pair at 2048 bits', async () => {
    const { publicJwk, privateJwk } = (await generateRsaKeyPair(2048)) as {
      publicJwk: any
      privateJwk: any
    }
    expect(publicJwk.kty).toBe('RSA')
    expect(typeof publicJwk.n).toBe('string')
    expect(typeof publicJwk.e).toBe('string')
    expect(publicJwk.d).toBeUndefined()

    expect(privateJwk.kty).toBe('RSA')
    expect(privateJwk.n).toBe(publicJwk.n)
    expect(privateJwk.e).toBe(publicJwk.e)
    for (const f of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      expect(typeof privateJwk[f]).toBe('string')
    }
  }, 30_000)

  it('rejects bit-sizes below 2048', async () => {
    await expect(generateRsaKeyPair(1024)).rejects.toThrow()
  })
})

describe('jwkThumbprint', () => {
  it('matches the RFC 7638 §3.1 example vector', () => {
    // Test vector from RFC 7638 §3.1
    const jwk = {
      kty: 'RSA',
      n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
      e: 'AQAB',
    }
    expect(jwkThumbprint(jwk)).toBe(
      'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs',
    )
  })

  it('round-trips through generated keys', async () => {
    const ed = generateEd25519KeyPair() as { publicJwk: any; privateJwk: any }
    expect(jwkThumbprint(ed.publicJwk)).toBe(jwkThumbprint(ed.privateJwk))

    const rsa = (await generateRsaKeyPair(2048)) as {
      publicJwk: any
      privateJwk: any
    }
    expect(jwkThumbprint(rsa.publicJwk)).toBe(jwkThumbprint(rsa.privateJwk))
  }, 30_000)

  it('rejects JWKs missing required fields', () => {
    expect(() => jwkThumbprint({ kty: 'RSA', n: 'abc' })).toThrow()
    expect(() => jwkThumbprint({ kty: 'OKP' })).toThrow()
    expect(() => jwkThumbprint({})).toThrow()
  })
})
