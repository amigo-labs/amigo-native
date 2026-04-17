import { describe, it } from 'vitest';
import fc from 'fast-check';
import { hash, verify } from '../index.js';

// Argon2 is deliberately slow; keep run count low and use minimum cost.
const COST = { memoryCost: 1024, timeCost: 1, parallelism: 1 } as const;

describe('argon2 fuzzing', () => {
  it('hash → verify roundtrip for random passwords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 200 }),
        async (pw) => {
          const hashed = await hash(pw, COST);
          return await verify(hashed, pw);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  it('wrong password is never accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (pw1, pw2) => {
          fc.pre(pw1 !== pw2);
          const hashed = await hash(pw1, COST);
          return !(await verify(hashed, pw2));
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });
});
