import { describe, it } from 'vitest';
import fc from 'fast-check';
import { xxh32, xxh64, xxh3_64, Xxh3Hasher } from '../index.js';
import createXxhash from 'xxhash-wasm';

describe('xxhash fuzzing', () => {
  it('xxh32 never throws for arbitrary byte input', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100_000 }),
        (input) => {
          const result = xxh32(Buffer.from(input));
          return (
            typeof result === 'number' &&
            Number.isInteger(result) &&
            result >= 0
          );
        },
      ),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('xxh64 never throws for arbitrary byte input', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100_000 }),
        (input) => {
          const result = xxh64(Buffer.from(input));
          return typeof result === 'bigint' && result >= 0n;
        },
      ),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('streaming is consistent with one-shot across random chunk boundaries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uint8Array({ minLength: 0, maxLength: 1000 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (chunks) => {
          const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
          const oneShot = xxh3_64(combined);

          const hasher = new Xxh3Hasher();
          for (const chunk of chunks) hasher.update(Buffer.from(chunk));
          return hasher.digest() === oneShot;
        },
      ),
      { numRuns: 5000, seed: 42 },
    );
  });

  it('native xxh32 matches xxhash-wasm for arbitrary input', async () => {
    const wasm = await createXxhash();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 5000 }), (input) => {
        return (
          xxh32(Buffer.from(input), 0) === wasm.h32Raw(Buffer.from(input), 0)
        );
      }),
      { numRuns: 2000, seed: 42 },
    );
  });

  it('native xxh64 matches xxhash-wasm for arbitrary input', async () => {
    const wasm = await createXxhash();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 5000 }), (input) => {
        return (
          xxh64(Buffer.from(input), 0n) === wasm.h64Raw(Buffer.from(input))
        );
      }),
      { numRuns: 2000, seed: 42 },
    );
  });
});
