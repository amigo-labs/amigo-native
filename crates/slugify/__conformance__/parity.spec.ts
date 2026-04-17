import { describe, it, expect } from 'vitest';
import originalSlugify from 'slugify';
import { slugify as nativeSlugify } from '../index.js';

// Against `slugify` npm with { lower: true, strict: true }. Documented
// divergences live in DIFFERENCES.md; encode the expected native output
// explicitly for those cases.

type ParityCase = { input: string; native?: string };

const mk = (...entries: Array<string | ParityCase>): ParityCase[] =>
  entries.map((e) => (typeof e === 'string' ? { input: e } : e));

const BASIC_CASES = mk(
  'Hello World',
  'foo bar baz',
  'Already-A-Slug',
  'UPPER CASE',
  '123 numbers 456',
  'mixed 123 Content!',
  '',
  '   whitespace   ',
  'a   b   c',
  'one-two-three',
);

const UNICODE_CASES = mk(
  'Ärger über Übel',
  'café résumé',
  'naïve coöperate',
  'Ñoño español',
  'Cześć polskie znaki',
  'Привет мир',
  { input: '日本語テスト', native: 'ri-ben-yu-tesuto' }, // see DIFFERENCES.md
  { input: '한국어 테스트', native: 'hangugeo-teseuteu' }, // see DIFFERENCES.md
  { input: 'مرحبا بالعالم', native: 'mrhb-bl-lm' }, // see DIFFERENCES.md
  { input: 'Ελληνικά κείμενο', native: 'ellenika-keimeno' }, // see DIFFERENCES.md (Greek η)
);

const SPECIAL_CHAR_CASES = mk(
  { input: 'foo@bar.com', native: 'foo-bar-com' }, // see DIFFERENCES.md
  { input: 'hello & goodbye', native: 'hello-goodbye' }, // see DIFFERENCES.md
  { input: 'price: $100', native: 'price-100' }, // see DIFFERENCES.md
  { input: '50% off!', native: '50-off' }, // see DIFFERENCES.md
  'C++ programming',
  { input: 'node.js rocks', native: 'node-js-rocks' }, // see DIFFERENCES.md
  { input: 'under_score case', native: 'under-score-case' }, // see DIFFERENCES.md
  { input: 'path/to/file', native: 'path-to-file' }, // see DIFFERENCES.md
  { input: 'query?param=value', native: 'query-param-value' }, // see DIFFERENCES.md
  '#hashtag',
);

const EDGE_CASES = mk(
  '---',
  '...',
  '   ',
  '\t\n\r',
  'a',
  'A'.repeat(1000),
  {
    input: '🎉 emoji 🚀 test 🌍',
    native: 'tada-emoji-rocket-test-earth-africa',
  }, // see DIFFERENCES.md
  'mix 123 !@# abc',
  { input: '\u0000null\u0000byte', native: 'null-byte' }, // see DIFFERENCES.md
  { input: 'Ꝃ extended latin', native: 'k-extended-latin' }, // see DIFFERENCES.md
);

const OPTS = { lower: true, strict: true } as const;

function runSuite(label: string, cases: ParityCase[]) {
  describe(`slugify parity — ${label}`, () => {
    for (const { input, native } of cases) {
      const title = `"${input.slice(0, 40)}"`;
      it(title, () => {
        const actual = nativeSlugify(input);
        if (native !== undefined) {
          expect(actual).toBe(native);
        } else {
          const expected = originalSlugify(input, OPTS);
          expect(actual).toBe(expected);
        }
      });
    }
  });
}

runSuite('basic', BASIC_CASES);
runSuite('unicode', UNICODE_CASES);
runSuite('special chars', SPECIAL_CHAR_CASES);
runSuite('edge cases', EDGE_CASES);
