import { describe, it, expect } from 'vitest'
import * as originalBcrypt from 'bcrypt'
import bcryptjs from 'bcryptjs'
import { hash, hashSync, verify } from '../index.js'

// bcrypt randomizes the salt, so parity here means cross-verification:
// a hash emitted by one implementation must verify with the other two.

const COST = 4 // minimum for fast tests

const PASSWORDS = [
  'simple',
  'P@$$w0rd!',
  'über-sëcüre-pässwörd',
  '🔑🔐🔒',
  'a'.repeat(72),
  ' leading-trailing ',
  '日本語パスワード',
]

describe('bcrypt cross-verify — native hash, bcrypt npm verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const nativeHash = await hash(pw, { cost: COST })
      expect(nativeHash).toMatch(/^\$2[aby]\$/)
      const verified = await originalBcrypt.compare(pw, nativeHash)
      expect(verified).toBe(true)
    })
  }
})

describe('bcrypt cross-verify — native hash, bcryptjs verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const nativeHash = await hash(pw, { cost: COST })
      const verified = await bcryptjs.compare(pw, nativeHash)
      expect(verified).toBe(true)
    })
  }
})

describe('bcrypt cross-verify — bcrypt npm hash, native verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const originalHash = await originalBcrypt.hash(pw, COST)
      const verified = await verify(originalHash, pw)
      expect(verified).toBe(true)
    })
  }
})

describe('bcrypt cross-verify — bcryptjs hash, native verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const jsHash = await bcryptjs.hash(pw, COST)
      const verified = await verify(jsHash, pw)
      expect(verified).toBe(true)
    })
  }
})

describe('bcrypt negative verification', () => {
  it('wrong password fails with native hash', async () => {
    const hashed = await hash('correct', { cost: COST })
    expect(await verify(hashed, 'wrong')).toBe(false)
  })

  it('wrong password fails against bcrypt npm hash', async () => {
    const hashed = await originalBcrypt.hash('correct', COST)
    expect(await verify(hashed, 'wrong')).toBe(false)
  })

  it('sync hash cross-verifies with bcrypt npm', async () => {
    const nativeHash = hashSync('test-sync', { cost: COST })
    const verified = await originalBcrypt.compare('test-sync', nativeHash)
    expect(verified).toBe(true)
  })
})

describe('bcrypt 72-byte truncation parity', () => {
  it('all three implementations agree on 72-byte truncation', async () => {
    const seventyThree = 'a'.repeat(73)
    const nativeHash = hashSync(seventyThree, { cost: COST })
    expect(await originalBcrypt.compare('a'.repeat(72), nativeHash)).toBe(true)
    expect(await bcryptjs.compare('a'.repeat(72), nativeHash)).toBe(true)
  })
})
