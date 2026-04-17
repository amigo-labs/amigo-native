import { describe, it, expect } from 'vitest';
import * as originalArgon2 from 'argon2';
import { hash, hashSync, verify } from '../index.js';

// Argon2 randomizes the salt, so parity here means cross-verification:
// a hash emitted by one implementation must verify with the other.

const PASSWORDS = [
  'simple',
  'P@$$w0rd!',
  'über-sëcüre-pässwörd',
  '🔑🔐🔒',
  '',
  'a'.repeat(72),
  'a'.repeat(256),
  'null\x00byte',
  ' leading-trailing ',
  '日本語パスワード',
];

describe('argon2 cross-verify — native hash, original verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const nativeHash = await hash(pw);
      expect(nativeHash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/);
      const verified = await originalArgon2.verify(nativeHash, pw);
      expect(verified).toBe(true);
    });
  }
});

describe('argon2 cross-verify — original hash, native verify', () => {
  for (const pw of PASSWORDS) {
    it(`password: "${pw.slice(0, 30)}"`, async () => {
      const originalHash = await originalArgon2.hash(pw, {
        type: originalArgon2.argon2id,
      });
      const verified = await verify(originalHash, pw);
      expect(verified).toBe(true);
    });
  }
});

describe('argon2 negative verification', () => {
  it('wrong password fails with native hash', async () => {
    const hashed = await hash('correct');
    expect(await verify(hashed, 'wrong')).toBe(false);
  });

  it('wrong password fails with cross-verification against native', async () => {
    const hashed = await originalArgon2.hash('correct', {
      type: originalArgon2.argon2id,
    });
    expect(await verify(hashed, 'wrong')).toBe(false);
  });

  it('sync hash cross-verifies with original', async () => {
    const nativeHash = hashSync('test-sync');
    const verified = await originalArgon2.verify(nativeHash, 'test-sync');
    expect(verified).toBe(true);
  });
});

describe('argon2 options parity', () => {
  it('custom memory/time/parallelism is reflected in the PHC string', async () => {
    const opts = { memoryCost: 32768, timeCost: 2, parallelism: 2 };
    const hashed = await hash('test', opts);
    expect(hashed).toContain('m=32768');
    expect(hashed).toContain('t=2');
    expect(hashed).toContain('p=2');
    const verified = await originalArgon2.verify(hashed, 'test');
    expect(verified).toBe(true);
  });
});
