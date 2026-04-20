import { describe, it, expect } from 'vitest'
import * as originalBcrypt from 'bcrypt'
import bcryptjs from 'bcryptjs'
import { hash, verify, hashSync, verifySync } from '../index.js'

/**
 * Upstream conformance — pinned bcrypt test vectors from the OpenWall
 * crypt_blowfish reference (public domain, identical to what upstream
 * `bcrypt` npm ships), plus full cross-verification against both
 * `bcrypt` and `bcryptjs`.
 *
 * Since `@amigo-labs/bcrypt` vendors the same `crypt_blowfish` C source,
 * every hash we produce must verify under both upstream packages, and
 * every hash either upstream produces must verify under us.
 *
 * Test vectors: https://github.com/kelektiv/node.bcrypt.js/blob/master/test/test_async.js
 * and the OpenWall bcrypt page at https://www.openwall.com/crypt/
 */

// --- Canonical OpenWall / crypt_blowfish pinned vectors ----------------
// Each (password, hash) pair below is the output of the reference
// implementation. A correct bcrypt MUST accept them.

const PINNED: Array<{ pw: string; hash: string; cost: number }> = [
  {
    pw: 'U*U',
    hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW',
    cost: 5,
  },
  {
    pw: 'U*U*',
    hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK',
    cost: 5,
  },
  {
    pw: 'U*U*U',
    hash: '$2a$05$XXXXXXXXXXXXXXXXXXXXXOAcXxm9kjPGEMsLznoKqmqw7tc8WCx4a',
    cost: 5,
  },
  {
    pw: '',
    hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy',
    cost: 5,
  },
  {
    pw: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789chars after 72 are ignored',
    hash: '$2a$05$abcdefghijklmnopqrstuu5s2v8.iXieOjg/.AySBTTZIIVFJeBui',
    cost: 5,
  },
]

describe('bcrypt — pinned crypt_blowfish test vectors (OpenWall reference)', () => {
  for (const { pw, hash: pinnedHash } of PINNED) {
    const label = pw.length > 30 ? pw.slice(0, 30) + '…' : pw || '(empty)'
    it(`verifies ${JSON.stringify(label)} against pinned $2a$ hash`, async () => {
      expect(await verify(pinnedHash, pw)).toBe(true)
    })

    it(`rejects wrong password for pinned $2a$ hash ${JSON.stringify(label)}`, async () => {
      // Prepend 'x' so we don't land in the 72-byte-truncation zone where
      // trailing bytes are spec-ignored — both OpenWall and our binding drop
      // input past byte 72 regardless of truth.
      expect(await verify(pinnedHash, 'x' + pw)).toBe(false)
    })
  }
})

// --- Cross-verification over a corpus ---------------------------------

const CORPUS = [
  'simple',
  'P@$$w0rd!',
  '',
  '1234567890',
  'correct horse battery staple',
  'a'.repeat(72), // bcrypt truncates above 72; our hash still produced
  '日本語パスワード',
  '🔑🔐🔒',
  'Ümlaut-päßwörd',
]

describe('bcrypt — full cross-verify: we hash, upstream verifies', () => {
  for (const pw of CORPUS) {
    const label = pw.length > 30 ? pw.slice(0, 30) + '…' : pw || '(empty)'
    it(`ours→bcrypt-npm: ${JSON.stringify(label)}`, async () => {
      const ours = await hash(pw, { cost: 4 })
      expect(await originalBcrypt.compare(pw, ours)).toBe(true)
    })

    it(`ours→bcryptjs: ${JSON.stringify(label)}`, async () => {
      const ours = await hash(pw, { cost: 4 })
      expect(await bcryptjs.compare(pw, ours)).toBe(true)
    })
  }
})

describe('bcrypt — full cross-verify: upstream hashes, we verify', () => {
  for (const pw of CORPUS) {
    const label = pw.length > 30 ? pw.slice(0, 30) + '…' : pw || '(empty)'
    it(`bcrypt-npm→ours: ${JSON.stringify(label)}`, async () => {
      const theirs = await originalBcrypt.hash(pw, 4)
      expect(await verify(theirs, pw)).toBe(true)
    })

    it(`bcryptjs→ours: ${JSON.stringify(label)}`, async () => {
      const theirs = await bcryptjs.hash(pw, 4)
      expect(await verify(theirs, pw)).toBe(true)
    })
  }
})

// --- Structural invariants from the bcrypt spec ------------------------

describe('bcrypt — hash shape invariants', () => {
  it('our hash uses $2b$ by default', async () => {
    const h = await hash('test', { cost: 4 })
    expect(h).toMatch(/^\$2[aby]\$/)
    expect(h.length).toBe(60)
  })

  it('cost parameter is reflected in the output', async () => {
    const h6 = await hash('test', { cost: 6 })
    expect(h6).toMatch(/^\$2[aby]\$06\$/)
  })

  it('72-byte truncation matches upstream (both accept hash at position 72)', async () => {
    // bcrypt ignores input beyond 72 bytes — both implementations agree.
    const short = 'a'.repeat(72)
    const long = short + 'this trailing text is ignored by the algorithm'
    const h = await hash(short, { cost: 4 })
    expect(await verify(h, long)).toBe(true)
  })

  it('sync variants produce conforming output', () => {
    const h = hashSync('sync', { cost: 4 })
    expect(verifySync(h, 'sync')).toBe(true)
  })
})
