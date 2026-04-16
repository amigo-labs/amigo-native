import { describe, it, expect } from 'vitest';
import originalSanitize from 'sanitize-html';
import { sanitize as nativeSanitize } from '../index.js';

// `sanitize-html` (npm) and ammonia (Rust) ship different default allowlists,
// so the primary guarantee is behavioral: dangerous input must be neutralized,
// safe content must survive. A narrow byte-parity suite runs with an allowlist
// that both implementations accept.

const XSS_VECTORS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  '<div style="background:url(javascript:alert(1))">',
  '<iframe src="data:text/html,<script>alert(1)</script>">',
  '<input onfocus=alert(1) autofocus>',
  '<body onload=alert(1)>',
  '<details open ontoggle=alert(1)>',
  '<marquee onstart=alert(1)>',
  '<video><source onerror=alert(1)>',
  '<audio src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<img src="x" onerror="alert(1)" />',
  '<svg/onload=alert(1)>',
  '<img src=1 onerror=alert(1)//',
];

const SAFE_HTML = [
  '<p>Normal paragraph</p>',
  '<b>Bold</b> and <i>italic</i>',
  '<a href="https://example.com">Link</a>',
  '<ul><li>Item 1</li><li>Item 2</li></ul>',
  '<h1>Heading</h1><p>Text</p>',
  '<br>',
  '<blockquote>Quote</blockquote>',
  'Plain text without HTML',
  '',
];

const DANGEROUS_PATTERN =
  /(<script|onerror\s*=|onload\s*=|onclick\s*=|onfocus\s*=|ontoggle\s*=|onstart\s*=|javascript:)/i;

describe('sanitize-html — XSS vectors removed', () => {
  for (const vector of XSS_VECTORS) {
    it(`removes: ${vector.slice(0, 50)}`, () => {
      const result = nativeSanitize(vector);
      expect(result).not.toMatch(DANGEROUS_PATTERN);
    });
  }
});

describe('sanitize-html — safe HTML text preserved', () => {
  for (const html of SAFE_HTML) {
    it(`preserves text of: ${html.slice(0, 50)}`, () => {
      const result = nativeSanitize(html);
      // Every run of visible text between tags must survive in the output.
      const textChunks = html
        .split(/<[^>]*>/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const chunk of textChunks) {
        expect(result).toContain(chunk);
      }
    });
  }
});

describe('sanitize-html — byte parity with shared allowlist', () => {
  // Both implementations receive the same explicit allowedTags list. No
  // attributes allowed, no classes. Differences beyond that go in DIFFERENCES.md.
  const sharedAllowedTags = ['p', 'b', 'i', 'a', 'br', 'ul', 'ol', 'li'];

  const PARITY_CASES: Array<{ input: string; native?: string }> = [
    { input: '<p>Hello <b>world</b></p>' },
    { input: '<b>bold</b> <script>bad</script> <i>italic</i>' },
    { input: 'no tags at all' },
    { input: '<p>Nested <b>bold <i>and italic</i></b></p>' },
  ];

  for (const { input, native } of PARITY_CASES) {
    it(`parity: ${input.slice(0, 50)}`, () => {
      const actual = nativeSanitize(input, { allowedTags: sharedAllowedTags });
      if (native !== undefined) {
        expect(actual).toBe(native);
      } else {
        const expected = originalSanitize(input, {
          allowedTags: sharedAllowedTags,
          allowedAttributes: {},
        });
        expect(actual).toBe(expected);
      }
    });
  }
});
