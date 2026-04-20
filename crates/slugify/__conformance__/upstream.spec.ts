import { describe, it, expect } from 'vitest'
import originalSlugify from 'slugify'
import { slugify, slugifyWithSeparator } from '../index.js'

/**
 * Upstream conformance — every worked example from the `slugify` npm
 * package's README must produce the same output under `@amigo-labs/slugify`
 * invoked with its closest-matching call.
 *
 * Upstream source: https://github.com/simov/slugify — README "Usage" section
 * as of slugify@1.6.x. We call `originalSlugify(input, { lower: true, strict: true })`
 * as the ground truth, because our `slugify()` is a pre-configured
 * drop-in for that specific option set (see `crates/slugify/README.md`).
 *
 * Anything we intentionally diverge on lives in `../DIFFERENCES.md` and is
 * asserted with a hand-written expected value here.
 */

const UPSTREAM_OPTS = { lower: true, strict: true } as const
const ref = (s: string) => originalSlugify(s, UPSTREAM_OPTS)

// --- README — "Usage" examples -----------------------------------------

describe('slugify — README usage examples', () => {
  it('basic example: "some string"', () => {
    expect(slugify('some string')).toBe(ref('some string'))
  })

  it('custom separator via slugifyWithSeparator', () => {
    // Upstream: `slugify('some string', '_')` → `'some_string'`.
    // Our analogue: `slugifyWithSeparator(input, '_')`.
    expect(slugifyWithSeparator('some string', '_')).toBe(
      originalSlugify('some string', { ...UPSTREAM_OPTS, replacement: '_' }),
    )
  })

  it('mixed case', () => {
    expect(slugify('Some String')).toBe(ref('Some String'))
  })

  it('multiple adjacent spaces collapse', () => {
    expect(slugify('some    string   with    spaces')).toBe(
      ref('some    string   with    spaces'),
    )
  })
})

// --- slugify upstream test suite (common cases from README + real-world) ---

const UPSTREAM_CORPUS: string[] = [
  // README examples
  'some string',
  'Some string',
  'SOME STRING',
  // Whitespace variants
  'leading space',
  'trailing space ',
  '  padded  ',
  'multiple   spaces',
  // Punctuation that's kept in strict mode
  'kebab-case-already',
  // ASCII alphanumerics
  'abc123',
  '123abc',
  '123 456 789',
  // Long input
  'the quick brown fox jumps over the lazy dog',
]

describe('slugify — upstream corpus (strict+lower mode)', () => {
  for (const input of UPSTREAM_CORPUS) {
    it(`matches upstream on ${JSON.stringify(input)}`, () => {
      expect(slugify(input)).toBe(ref(input))
    })
  }
})

// --- Separator customization (slugifyWithSeparator) ---------------------

describe('slugify — custom separators match upstream', () => {
  const inputs = ['hello world foo', 'multi word input', 'a b c d']
  const seps = ['-', '_', '.', '~']
  for (const sep of seps) {
    for (const input of inputs) {
      it(`slugifyWithSeparator(${JSON.stringify(input)}, ${JSON.stringify(sep)})`, () => {
        expect(slugifyWithSeparator(input, sep)).toBe(
          originalSlugify(input, { ...UPSTREAM_OPTS, replacement: sep }),
        )
      })
    }
  }
})

// --- Intentional divergences (these do NOT match upstream) --------------

describe('slugify — documented divergences (see DIFFERENCES.md)', () => {
  it('CJK transliteration — we romanize, upstream strips', () => {
    // Upstream with { strict: true } drops CJK entirely; we transliterate.
    // Just assert output shape rather than compare.
    const out = slugify('日本語テスト')
    expect(out).toMatch(/^[a-z0-9-]+$/)
    expect(out.length).toBeGreaterThan(0)
  })
})
