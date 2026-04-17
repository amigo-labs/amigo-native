import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parse, stringify } from '../index.js';

describe('csv fuzzing', () => {
  it('stringify → parse roundtrip preserves row contents', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.string({ minLength: 0, maxLength: 50 }), {
            minLength: 1,
            maxLength: 10,
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (rows) => {
          // Normalize to a rectangular shape so the roundtrip is well-defined.
          const maxLen = Math.max(...rows.map((r) => r.length));
          const normalized = rows.map((r) => [
            ...r,
            ...Array(maxLen - r.length).fill(''),
          ]);

          const csv = stringify(normalized);
          // Stringified output has no header; parse without skipping.
          const parsed = parse(Buffer.from(csv), { hasHeaders: false });
          return JSON.stringify(parsed) === JSON.stringify(normalized);
        },
      ),
      { numRuns: 5000, seed: 42 },
    );
  });

  it('parse never throws for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10000 }), (input) => {
        try {
          parse(Buffer.from(input), { flexible: true, hasHeaders: false });
        } catch {
          // Parse errors on malformed CSV are acceptable; Rust panics / aborts are not.
        }
        return true;
      }),
      { numRuns: 10000, seed: 42 },
    );
  });
});
