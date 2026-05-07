import { describe, it } from 'vitest';
import fc from 'fast-check';
import { slugify as nativeSlugify } from '../index.js';

// Full parity with `slugify` npm is not a goal (punctuation, emoji, CJK,
// and symbol-as-word handling all diverge — see DIFFERENCES.md). The
// invariants below MUST hold for any input, regardless of the original.

describe('slugify fuzzing — invariants', () => {
  it('output is always lowercase', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const result = nativeSlugify(input);
        return result === result.toLowerCase();
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('output never contains double separators', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const result = nativeSlugify(input);
        return !result.includes('--');
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('output has no leading or trailing separators', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const result = nativeSlugify(input);
        return !result.startsWith('-') && !result.endsWith('-');
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('output contains only [a-z0-9-]', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const result = nativeSlugify(input);
        return /^[a-z0-9-]*$/.test(result);
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('idempotent: slugify(slugify(x)) === slugify(x)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const once = nativeSlugify(input);
        const twice = nativeSlugify(once);
        return once === twice;
      }),
      { numRuns: 10000, seed: 42 },
    );
  });
});
