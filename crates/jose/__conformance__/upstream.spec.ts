import { describe, it, expect } from 'vitest'
import { jwkThumbprint, generateEd25519KeyPair } from '../index.js'

/**
 * RFC 7638 — JWK Thumbprint — conformance against published test vectors.
 *
 * Upstream source: https://www.rfc-editor.org/rfc/rfc7638
 *   Section 3.1: canonical example produced by the spec authors.
 * Additional vectors: RFC 8037 Section A.3 (Ed25519 JWK thumbprint).
 *
 * These vectors are the ground truth for any RFC 7638 implementation.
 * Passing them is the real Drop-in claim for JWK thumbprints.
 */

describe('RFC 7638 §3.1 — RSA JWK thumbprint canonical example', () => {
  const RSA_JWK = {
    kty: 'RSA',
    n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
    e: 'AQAB',
    alg: 'RS256',
    kid: '2011-04-29',
  }
  // Ground truth from RFC 7638 §3.1, final paragraph.
  const EXPECTED = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs'

  it('thumbprint matches RFC 7638 §3.1 expected output', () => {
    expect(jwkThumbprint(RSA_JWK)).toBe(EXPECTED)
  })

  it('thumbprint is stable under non-canonical member ordering', () => {
    const shuffled = { kid: RSA_JWK.kid, alg: RSA_JWK.alg, e: RSA_JWK.e, n: RSA_JWK.n, kty: RSA_JWK.kty }
    expect(jwkThumbprint(shuffled)).toBe(EXPECTED)
  })

  it('thumbprint ignores non-required members (kid, alg)', () => {
    const minimal = { kty: RSA_JWK.kty, n: RSA_JWK.n, e: RSA_JWK.e }
    expect(jwkThumbprint(minimal)).toBe(EXPECTED)
  })
})

describe('RFC 8037 §A.3 — Ed25519 JWK thumbprint', () => {
  // Public key vector from RFC 8037 Appendix A.1.
  const ED25519_JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  }
  // Ground truth from RFC 8037 Appendix A.3.
  const EXPECTED = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'

  it('thumbprint matches RFC 8037 §A.3 expected output', () => {
    expect(jwkThumbprint(ED25519_JWK)).toBe(EXPECTED)
  })
})

describe('RFC 7638 — generated Ed25519 keys produce stable thumbprints', () => {
  it('same public key yields same thumbprint across two calls', () => {
    const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
    const a = jwkThumbprint(publicJwk)
    const b = jwkThumbprint(publicJwk)
    expect(a).toBe(b)
  })

  it('distinct keys yield distinct thumbprints', () => {
    const k1 = generateEd25519KeyPair() as { publicJwk: any }
    const k2 = generateEd25519KeyPair() as { publicJwk: any }
    expect(jwkThumbprint(k1.publicJwk)).not.toBe(jwkThumbprint(k2.publicJwk))
  })
})
