import { describe, it, expect } from 'vitest'
import commonmarkSpec from 'commonmark-spec'
import { render } from '../index.js'

/**
 * Upstream conformance — runs the full 652-case CommonMark 0.31.2 spec
 * test suite (via the `commonmark-spec` npm package) against our
 * `render()` with spec-conforming options (raw HTML passthrough, no
 * heading-ID rewrite).
 *
 * `pulldown-cmark` is spec-compliant by design but has known deviations
 * in edge cases (entity expansion in attributes, some list/paragraph
 * interleaving, legacy-compat tab expansion). Failing tests are NOT
 * fixed here — they are captured and categorised in `divergences.md`
 * as documented, stable behaviour or future-work items.
 *
 * A hand-picked representative subset of examples also lives in this
 * file as `describe('CommonMark spec — representative examples', ...)`
 * to provide readable per-feature coverage next to the bulk run.
 */

// Normalise the `→` tab-placeholder used in the spec text to real tab
// characters, matching what upstream's reference test harness does.
const toReal = (s: string) => s.replace(/\u2192/g, '\t')

const SPEC_OPTS = { headingIds: false, unsafeHtml: true } as const

type SpecCase = { markdown: string; html: string; section: string; number: number }
const ALL_CASES: SpecCase[] = commonmarkSpec.tests

// --- Representative examples (hand-picked, always expected to pass) ---

describe('CommonMark spec — representative examples', () => {
  it('ex — emphasis with underscore', () => {
    expect(render('_foo_', SPEC_OPTS)).toContain('<em>foo</em>')
  })

  it('ex — nested emphasis', () => {
    expect(render('**foo _bar_**', SPEC_OPTS)).toContain('<strong>foo <em>bar</em></strong>')
  })

  it('ex — link destination with angles', () => {
    expect(render('[link](<foo bar>)', SPEC_OPTS)).toContain('<a href="foo%20bar">link</a>')
  })

  it('ex — image with title', () => {
    expect(render('![foo](/url "title")', SPEC_OPTS)).toContain(
      '<img src="/url" alt="foo" title="title"',
    )
  })

  it('ex — hard line break with trailing spaces', () => {
    expect(render('foo  \nbar', SPEC_OPTS)).toMatch(/foo<br \/>\s*\n?bar/)
  })

  it('ex — ATX heading levels (no IDs)', () => {
    expect(render('### foo', SPEC_OPTS)).toContain('<h3>foo</h3>')
  })

  it('ex — setext heading (no IDs)', () => {
    expect(render('Foo\n---', SPEC_OPTS)).toContain('<h2>Foo</h2>')
  })

  it('ex — blockquote with lazy continuation', () => {
    const out = render('> foo\nbar', SPEC_OPTS)
    expect(out).toContain('<blockquote>')
    expect(out).toMatch(/foo[\s\S]*bar/)
  })

  it('ex — GFM table basic', () => {
    const md = '| foo | bar |\n| --- | --- |\n| baz | bim |'
    const out = render(md, SPEC_OPTS)
    expect(out).toContain('<table>')
    expect(out).toContain('<th>foo</th>')
    expect(out).toContain('<td>baz</td>')
  })

  it('ex — GFM task list', () => {
    const out = render('- [x] done', SPEC_OPTS)
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('checked=""')
  })
})

// --- Full CommonMark 0.31.2 spec run ----------------------------------
//
// Failing cases are DOCUMENTED divergences — `pulldown-cmark` is close
// to spec-compliant but intentionally differs from the reference
// renderer in the 22 cases below. Each is marked with `it.fails` so CI
// stays green; if `pulldown-cmark` fixes one, the test flips to a real
// failure and alerts us to move it out of the list.
//
// Section summary lives in `divergences.md`.

const KNOWN_DIVERGENCES = new Set<number>([
  // Backslash escapes
  12, 14,
  // Entity / numeric character references
  27, 41,
  // Setext headings (edge case)
  91,
  // HTML blocks (edge case)
  175,
  // Link reference definitions (multi-line normalization)
  209, 210, 211,
  // Code spans
  343,
  // Emphasis / strong emphasis (intra-word precedence)
  352, 359, 363, 380, 385, 395,
  // Links / Images (title corner cases)
  508, 590,
  // Raw HTML (multi-line tag forms)
  619, 620, 624, 632,
])

describe('CommonMark 0.31 spec — full upstream corpus', () => {
  for (const t of ALL_CASES) {
    const title = `#${t.number} [${t.section}]`
    const runner = KNOWN_DIVERGENCES.has(t.number) ? it.fails : it
    runner(title, () => {
      const md = toReal(t.markdown)
      const expected = toReal(t.html)
      expect(render(md, SPEC_OPTS)).toBe(expected)
    })
  }
})
