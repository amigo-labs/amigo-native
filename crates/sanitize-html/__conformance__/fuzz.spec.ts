import { describe, it } from 'vitest';
import fc from 'fast-check';
import { sanitize } from '../index.js';

const htmlTag = fc.constantFrom(
  'div',
  'p',
  'span',
  'a',
  'b',
  'i',
  'script',
  'img',
  'svg',
  'iframe',
  'style',
  'input',
  'textarea',
  'form',
  'object',
  'embed',
);

const htmlAttr = fc.constantFrom(
  'onclick',
  'onerror',
  'onload',
  'href',
  'src',
  'style',
  'class',
  'id',
  'action',
  'formaction',
);

const htmlString = fc
  .array(
    fc.oneof(
      fc.string(),
      fc
        .tuple(htmlTag, htmlAttr, fc.string())
        .map(([tag, attr, val]) => `<${tag} ${attr}="${val}">content</${tag}>`),
      fc.tuple(htmlTag).map(([tag]) => `<${tag}>text</${tag}>`),
    ),
    { minLength: 1, maxLength: 10 },
  )
  .map((parts) => parts.join(''));

describe('sanitize-html fuzzing — security invariants', () => {
  it('output never contains <script> tags', () => {
    fc.assert(
      fc.property(htmlString, (html) => {
        const result = sanitize(html);
        return !/<script/i.test(result);
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('output never contains event handlers', () => {
    fc.assert(
      fc.property(htmlString, (html) => {
        const result = sanitize(html);
        return !/\bon\w+\s*=/i.test(result);
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('output never contains javascript: URLs', () => {
    fc.assert(
      fc.property(htmlString, (html) => {
        const result = sanitize(html);
        return !/javascript:/i.test(result);
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('always returns a string', () => {
    fc.assert(
      fc.property(htmlString, (html) => {
        const result = sanitize(html);
        return typeof result === 'string';
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it('idempotent: sanitize(sanitize(x)) === sanitize(x)', () => {
    fc.assert(
      fc.property(htmlString, (html) => {
        const once = sanitize(html);
        const twice = sanitize(once);
        return once === twice;
      }),
      { numRuns: 10000, seed: 42 },
    );
  });
});
