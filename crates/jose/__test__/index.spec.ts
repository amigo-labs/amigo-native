import { describe, it, expect } from 'vitest'
import { generateEd25519KeyPair, jwkThumbprint } from '../index.js'

// A stable RSA-2048 JWK — generated once via Node built-in
// crypto.generateKeyPair and pinned here so thumbprint tests do not
// depend on any RSA-generation path.
const PINNED_RSA_JWK = {
  kty: 'RSA',
  n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
  e: 'AQAB',
}

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

describe('jwkThumbprint', () => {
  it('matches the RFC 7638 §3.1 example vector', () => {
    expect(jwkThumbprint(PINNED_RSA_JWK)).toBe(
      'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs',
    )
  })

  it('round-trips through generated Ed25519 keys', () => {
    const ed = generateEd25519KeyPair() as { publicJwk: any; privateJwk: any }
    expect(jwkThumbprint(ed.publicJwk)).toBe(jwkThumbprint(ed.privateJwk))
  })

  it('handles RSA JWKs (public only — no private members hashed)', () => {
    const withPrivate = {
      ...PINNED_RSA_JWK,
      d: 'shouldbeignored',
      p: 'alsoignored',
    }
    expect(jwkThumbprint(withPrivate)).toBe(jwkThumbprint(PINNED_RSA_JWK))
  })

  it('rejects JWKs missing required fields', () => {
    expect(() => jwkThumbprint({ kty: 'RSA', n: 'abc' })).toThrow()
    expect(() => jwkThumbprint({ kty: 'OKP' })).toThrow()
    expect(() => jwkThumbprint({})).toThrow()
  })

  it('rejects unsupported kty values', () => {
    expect(() => jwkThumbprint({ kty: 'bogus' })).toThrow()
  })
})
