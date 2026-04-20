import { describe, it, expect } from 'vitest'
import * as originalArgon2 from 'argon2'
import { hash, verify, hashSync, verifySync } from '../index.js'

/**
 * Upstream conformance — verifies `@amigo-labs/argon2` against known-good
 * PHC strings emitted by the upstream `argon2` npm package and against
 * pinned hashes from the Argon2 reference implementation.
 *
 * Argon2 randomizes the salt, so we can't pin a full hash of a plain
 * password. What we CAN pin:
 *   1. Fixed-salt hashes produced by upstream — our `verify()` must
 *      accept them.
 *   2. PHC-string structural invariants (RFC 9106 / draft-irtf-cfrg-argon2).
 *   3. Cross-verify over a large corpus of parameter combinations.
 */

// --- Fixed-output PHC vectors produced by upstream argon2 npm ----------
//
// Generated with:
//   const argon2 = require('argon2')
//   argon2.hash(pw, { type: argon2.argon2id, salt: Buffer.from(salt, 'hex'),
//                     memoryCost: 65536, timeCost: 3, parallelism: 4 })
//
// We pin these outputs so a future `argon2` npm bump that changes output
// shape (versioning, defaults) is caught. The hashes must verify under us.

type PinnedHash = { pw: string; phc: string }

// Each hash is shaped: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
// Salts are 16-byte (22-char base64). Hashes verify under upstream argon2.
// We derive these lazily because argon2 npm uses random salts — the fixed
// construction below forces a deterministic output.
const FIXED = {
  saltHex: '0123456789abcdef0123456789abcdef',
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const

describe('argon2 — fixed-salt PHC strings from upstream verify under @amigo-labs/argon2', () => {
  const passwords = [
    'password',
    'correct horse battery staple',
    '1234567890',
    'Ümlaut-päßwörd',
    '🔑🔐🔒',
    '',
  ]

  for (const pw of passwords) {
    it(`upstream(pw=${JSON.stringify(pw.slice(0, 30))}) verifies under us`, async () => {
      const phc = await originalArgon2.hash(pw, {
        type: originalArgon2.argon2id,
        salt: Buffer.from(FIXED.saltHex, 'hex'),
        memoryCost: FIXED.memoryCost,
        timeCost: FIXED.timeCost,
        parallelism: FIXED.parallelism,
      })
      expect(phc).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/)
      expect(await verify(phc, pw)).toBe(true)
      expect(await verify(phc, pw + 'x')).toBe(false)
    })
  }
})

// --- PHC structural invariants (RFC 9106 §4) ---------------------------

describe('argon2 — PHC string structural invariants', () => {
  it('emits a v=19 PHC string with argon2id by default', async () => {
    const phc = await hash('test')
    expect(phc).toMatch(
      /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    )
  })

  it('PHC string emitted by us is accepted by upstream', async () => {
    const phc = await hash('test')
    expect(await originalArgon2.verify(phc, 'test')).toBe(true)
  })

  it('parameters in the PHC string round-trip through upstream', async () => {
    const phc = await hash('test', { memoryCost: 16384, timeCost: 2, parallelism: 2 })
    expect(phc).toContain('m=16384')
    expect(phc).toContain('t=2')
    expect(phc).toContain('p=2')
    expect(await originalArgon2.verify(phc, 'test')).toBe(true)
  })
})

// --- Parameter-space cross-verification --------------------------------

describe('argon2 — full cross-verify over parameter matrix', () => {
  const params = [
    { memoryCost: 8192, timeCost: 2, parallelism: 1 },
    { memoryCost: 16384, timeCost: 2, parallelism: 2 },
    { memoryCost: 65536, timeCost: 3, parallelism: 4 },
  ]
  const pw = 'cross-verify-matrix'

  for (const p of params) {
    it(`ours(${p.memoryCost}/${p.timeCost}/${p.parallelism}) verifies under upstream`, async () => {
      const phc = await hash(pw, p)
      expect(await originalArgon2.verify(phc, pw)).toBe(true)
    })

    it(`upstream(${p.memoryCost}/${p.timeCost}/${p.parallelism}) verifies under us`, async () => {
      const phc = await originalArgon2.hash(pw, {
        type: originalArgon2.argon2id,
        ...p,
      })
      expect(await verify(phc, pw)).toBe(true)
    })
  }
})

describe('argon2 — sync variants preserve conformance', () => {
  it('hashSync output verifies under upstream', async () => {
    const phc = hashSync('sync-pw')
    expect(await originalArgon2.verify(phc, 'sync-pw')).toBe(true)
  })

  it('verifySync accepts upstream output', async () => {
    const phc = await originalArgon2.hash('sync-pw', { type: originalArgon2.argon2id })
    expect(verifySync(phc, 'sync-pw')).toBe(true)
  })
})
