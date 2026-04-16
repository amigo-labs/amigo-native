import { describe, it, expect, beforeAll } from 'vitest';
import { xxh32, xxh64, xxh3_64, xxh3_128, Xxh3Hasher } from '../index.js';
import createXxhash from 'xxhash-wasm';
import XXH from 'xxhashjs';

let wasmHasher: Awaited<ReturnType<typeof createXxhash>>;

beforeAll(async () => {
  wasmHasher = await createXxhash();
});

// Canonical XXH32 vector from the reference implementation:
// https://github.com/Cyan4973/xxHash/wiki/xxHash-specification-(draft)
describe('xxhash official test vectors', () => {
  it('xxh32("") with seed=0 equals 0x02CC5D05', () => {
    expect(xxh32(Buffer.from(''), 0)).toBe(0x02cc5d05);
  });
});

const TEST_INPUTS: string[] = [
  '',
  'a',
  'hello',
  'hello world',
  'a'.repeat(100),
  'a'.repeat(10000),
  'Ärger über Übel',
  '🎉🚀🌍',
  '\x00\x01\x02\x03',
  Buffer.alloc(1024, 0x42).toString('binary'),
];

describe('xxhash cross-verify against xxhash-wasm', () => {
  for (const input of TEST_INPUTS) {
    const label = JSON.stringify(input.slice(0, 30));
    it(`xxh32 ${label}`, () => {
      const native = xxh32(Buffer.from(input), 0);
      const wasm = wasmHasher.h32Raw(Buffer.from(input), 0);
      expect(native).toBe(wasm);
    });

    it(`xxh64 ${label}`, () => {
      const native = xxh64(Buffer.from(input), 0n);
      const wasm = wasmHasher.h64Raw(Buffer.from(input));
      expect(native).toBe(wasm);
    });
  }
});

describe('xxhash cross-verify against xxhashjs', () => {
  for (const input of TEST_INPUTS) {
    const label = JSON.stringify(input.slice(0, 30));
    it(`xxh32 ${label}`, () => {
      const native = xxh32(Buffer.from(input), 0);
      const xxhjs = XXH.h32(Buffer.from(input), 0).toNumber();
      expect(native).toBe(xxhjs);
    });

    it(`xxh64 ${label}`, () => {
      const native = xxh64(Buffer.from(input), 0n).toString(16);
      const xxhjs = XXH.h64(Buffer.from(input), 0).toString(16);
      expect(native).toBe(xxhjs);
    });
  }
});

describe('xxhash streaming parity', () => {
  it('streaming equals one-shot for a multi-chunk input', () => {
    const input = 'hello world this is a test of streaming xxhash';
    const chunks = [
      'hello ',
      'world ',
      'this is ',
      'a test ',
      'of streaming ',
      'xxhash',
    ];

    const oneShot = xxh3_64(Buffer.from(input));

    const hasher = new Xxh3Hasher();
    for (const chunk of chunks) hasher.update(Buffer.from(chunk));
    const streamed = hasher.digest();

    expect(streamed).toBe(oneShot);
  });

  it('streaming equals one-shot for varying chunk sizes', () => {
    const input = Buffer.alloc(10000);
    for (let i = 0; i < input.length; i++) input[i] = i & 0xff;

    const oneShot = xxh3_64(input);

    const hasher = new Xxh3Hasher();
    let offset = 0;
    for (const size of [1, 7, 13, 64, 128, 256, 1000, 3000, 5535]) {
      if (offset >= input.length) break;
      const end = Math.min(offset + size, input.length);
      hasher.update(input.subarray(offset, end));
      offset = end;
    }
    expect(hasher.digest()).toBe(oneShot);
  });
});

describe('xxhash determinism', () => {
  it('same input yields same hash (1000 iterations)', () => {
    const input = Buffer.from('determinism test');
    const expected = xxh3_64(input);
    for (let i = 0; i < 1000; i++) {
      expect(xxh3_64(input)).toBe(expected);
    }
  });

  it('different seeds yield overwhelmingly unique hashes', () => {
    const input = Buffer.from('seed test');
    const results = new Set<bigint>();
    for (let seed = 0n; seed < 100n; seed++) {
      results.add(xxh64(input, seed));
    }
    expect(results.size).toBeGreaterThanOrEqual(99);
  });
});

describe('xxhash output shape', () => {
  it('xxh3_128 emits a 32-char lowercase hex string', () => {
    expect(xxh3_128(Buffer.from('hello'))).toMatch(/^[0-9a-f]{32}$/);
  });

  it('Xxh3Hasher.digestHex emits a 16-char hex string', () => {
    const hasher = new Xxh3Hasher();
    hasher.update(Buffer.from('hello'));
    expect(hasher.digestHex()).toMatch(/^[0-9a-f]{16}$/);
  });
});
