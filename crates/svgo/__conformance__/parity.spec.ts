import { describe, expect, it } from 'vitest'
import { optimize as ours } from '../index.js'
import { optimize as upstream } from 'svgo'

function upstreamOptimize(svg: string): string {
  const res = upstream(svg, { multipass: false })
  return (res as { data: string }).data
}

describe('parity: both shrink', () => {
  const cases = [
    '<svg><!-- comment --><rect width="10"/></svg>',
    '<svg><title>t</title><rect/></svg>',
    '<svg><rect fill="black"/></svg>',
    '<svg><g><rect width="10"/></g></svg>',
    '<svg><rect width="10.0000"/></svg>',
  ]
  for (const input of cases) {
    it(`shrinks ${input.slice(0, 40)}`, () => {
      const ourOut = ours(input).data
      const upstreamOut = upstreamOptimize(input)
      expect(ourOut.length).toBeLessThanOrEqual(input.length)
      expect(upstreamOut.length).toBeLessThanOrEqual(input.length)
    })
  }
})

describe('parity: both strip comments', () => {
  it('agree that comments go', () => {
    const input = '<svg><!-- x --><rect/></svg>'
    expect(ours(input).data).not.toContain('x')
    expect(upstreamOptimize(input)).not.toContain('x')
  })
})

describe('parity: both drop metadata', () => {
  it('agree that metadata goes', () => {
    const input = '<svg><metadata>meta</metadata><rect/></svg>'
    expect(ours(input).data).not.toContain('metadata')
    expect(upstreamOptimize(input)).not.toContain('metadata')
  })
})

describe('parity: numeric cleanup', () => {
  it('both shorten 10.000 to 10', () => {
    const input = '<svg><rect width="10.000"/></svg>'
    const ourOut = ours(input).data
    const upstreamOut = upstreamOptimize(input)
    expect(ourOut).toContain('"10"')
    expect(upstreamOut).toContain('"10"')
  })
})
