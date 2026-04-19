import { describe, it, expect } from 'vitest'
import * as jose from 'jose'
import {
  generateEd25519KeyPair,
  generateRsaKeyPair,
  jwkThumbprint,
} from '../index.js'

// Parity here means: a JWK produced by us round-trips through panva/jose
// (importJWK + thumbprint) and produces the same thumbprint.

describe('jose JWK parity — Ed25519', () => {
  it('our generated public JWK is importable by panva/jose', async () => {
    const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
    const key = await jose.importJWK(publicJwk, 'EdDSA')
    expect(key).toBeDefined()
  })

  it('our thumbprint matches panva/jose calculateJwkThumbprint', async () => {
    const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
    const ours = jwkThumbprint(publicJwk)
    const theirs = await jose.calculateJwkThumbprint(publicJwk, 'sha256')
    expect(ours).toBe(theirs)
  })
})

describe('jose JWK parity — RSA', () => {
  it('our generated private RSA JWK round-trips through panva/jose import + sign + verify', async () => {
    const { publicJwk, privateJwk } = (await generateRsaKeyPair(2048)) as {
      publicJwk: any
      privateJwk: any
    }
    const privKey = await jose.importJWK(privateJwk, 'RS256')
    const pubKey = await jose.importJWK(publicJwk, 'RS256')

    const jwt = await new jose.SignJWT({ sub: 'amigo' })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privKey)

    const { payload } = await jose.jwtVerify(jwt, pubKey)
    expect(payload.sub).toBe('amigo')
  }, 30_000)

  it('our thumbprint matches panva/jose for RSA', async () => {
    const { publicJwk } = (await generateRsaKeyPair(2048)) as {
      publicJwk: any
    }
    const ours = jwkThumbprint(publicJwk)
    const theirs = await jose.calculateJwkThumbprint(publicJwk, 'sha256')
    expect(ours).toBe(theirs)
  }, 30_000)
})

describe('jose JWK parity — RFC 7638 vectors', () => {
  it('RFC 7638 §3.1 RSA example vector matches panva/jose', async () => {
    const jwk = {
      kty: 'RSA',
      n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
      e: 'AQAB',
    }
    const ours = jwkThumbprint(jwk)
    const theirs = await jose.calculateJwkThumbprint(jwk, 'sha256')
    expect(ours).toBe(theirs)
    expect(ours).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')
  })
})
