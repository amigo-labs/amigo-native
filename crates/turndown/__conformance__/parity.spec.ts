import { describe, expect, it } from 'vitest'
import { turndown as ours } from '../index.js'
import TurndownService from 'turndown'
// @ts-expect-error — no types
import { gfm } from 'turndown-plugin-gfm'

function upstream(html: string, { gfm: useGfm = false } = {}): string {
  const svc = new TurndownService()
  if (useGfm) svc.use(gfm)
  return svc.turndown(html)
}

describe('parity: basic shapes', () => {
  const cases: Array<[string, string]> = [
    ['heading h1', '<h1>Hello</h1>'],
    ['paragraph', '<p>A paragraph.</p>'],
    ['strong', '<p><strong>bold</strong></p>'],
    ['em', '<p><em>italic</em></p>'],
    ['link', '<p><a href="/x">link</a></p>'],
    ['ul', '<ul><li>a</li><li>b</li></ul>'],
    ['ol', '<ol><li>a</li><li>b</li></ol>'],
    ['code', '<p>use <code>x</code></p>'],
    ['hr', '<hr/>'],
  ]
  for (const [label, input] of cases) {
    it(`both produce non-empty output: ${label}`, () => {
      expect(ours(input).length).toBeGreaterThan(0)
      expect(upstream(input).length).toBeGreaterThan(0)
    })
  }
})

describe('parity: direction-of-output matches', () => {
  it('h1 produces marker on both (ours: #, upstream default: setext ===)', () => {
    // Our default is atx, upstream default is setext — different bytes,
    // both valid h1 syntax. We check both outputs contain the heading text
    // and at least one h1 marker.
    const ho = ours('<h1>X</h1>')
    const hu = upstream('<h1>X</h1>')
    expect(ho).toContain('X')
    expect(hu).toContain('X')
    expect(ho.includes('#') || ho.includes('=')).toBe(true)
    expect(hu.includes('#') || hu.includes('=')).toBe(true)
  })
  it('link produces [](url) on both', () => {
    expect(ours('<a href="/x">y</a>')).toMatch(/\[y\]\(\/x\)/)
    expect(upstream('<a href="/x">y</a>')).toMatch(/\[y\]\(\/x\)/)
  })
  it('ul produces bullets on both', () => {
    const o = ours('<ul><li>a</li></ul>')
    const u = upstream('<ul><li>a</li></ul>')
    // Upstream uses multi-space indentation after the marker (`*   a`);
    // we use a single space (`* a`). Both are valid CommonMark bullets.
    expect(o).toMatch(/^[-*+]\s+a/)
    expect(u).toMatch(/^[-*+]\s+a/)
  })
})

describe('parity: GFM tables', () => {
  const table =
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
  it('both emit | A | B | row', () => {
    const o = ours(table, { gfm: true })
    const u = upstream(table, { gfm: true })
    expect(o).toContain('| A | B |')
    expect(u).toContain('| A | B |')
  })
})
