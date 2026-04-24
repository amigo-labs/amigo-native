import { describe, expect, it } from 'vitest'
import { optimize, optimizeMany } from '../index.js'

describe('optimize', () => {
  it('removes comments by default', () => {
    const res = optimize('<svg><!-- hi --><rect/></svg>')
    expect(res.data).not.toContain('hi')
    expect(res.outputBytes).toBeLessThan(res.inputBytes)
  })

  it('removes metadata / title / desc', () => {
    const res = optimize(
      '<svg><title>t</title><desc>d</desc><metadata>m</metadata><rect/></svg>',
    )
    expect(res.data).not.toContain('title')
    expect(res.data).not.toContain('metadata')
    expect(res.data).not.toContain('desc')
  })

  it('strips empty attrs', () => {
    const res = optimize('<svg><rect id="" width="10"/></svg>')
    expect(res.data).not.toContain('id=')
    expect(res.data).toContain('width')
  })

  it('cleans up numeric values to floatPrecision', () => {
    const res = optimize('<svg><rect width="10.12345" height="5.000"/></svg>')
    expect(res.data).toContain('10.123')
    expect(res.data).toContain('"5"')
  })

  it('honours a custom floatPrecision', () => {
    const res = optimize('<svg><rect width="10.12345"/></svg>', { floatPrecision: 2 })
    expect(res.data).toContain('10.12')
  })

  it('removes elements with display=none', () => {
    const res = optimize('<svg><rect display="none" width="10"/><circle r="5"/></svg>')
    expect(res.data).not.toContain('rect')
    expect(res.data).toContain('circle')
  })

  it('converts named colors', () => {
    const res = optimize('<svg><rect fill="black" stroke="white"/></svg>')
    expect(res.data).toContain('#000')
    expect(res.data).toContain('#fff')
  })

  it('converts rgb() to hex', () => {
    const res = optimize('<svg><rect fill="rgb(255, 0, 0)"/></svg>')
    expect(res.data).toContain('#f00')
  })

  it('shortens #aabbcc to #abc', () => {
    const res = optimize('<svg><rect fill="#aabbcc"/></svg>')
    expect(res.data).toContain('#abc')
  })

  it('removes editor namespaces', () => {
    const res = optimize(
      '<svg xmlns:sodipodi="x"><rect sodipodi:nodetypes="cc" width="10"/></svg>',
    )
    expect(res.data).not.toContain('sodipodi')
  })

  it('collapses trivial groups', () => {
    const res = optimize('<svg><g><rect width="10"/></g></svg>')
    expect(res.data).not.toContain('<g>')
  })

  it('removes empty containers', () => {
    const res = optimize('<svg><g></g><defs></defs><rect/></svg>')
    expect(res.data).not.toContain('<g')
    expect(res.data).not.toContain('<defs')
  })

  it('reports savings percent > 0 on bloated input', () => {
    const res = optimize('<svg>  <!-- x -->  <rect width="1.000000"/>  </svg>')
    expect(res.savedPercent).toBeGreaterThan(0)
  })

  it('supports multipass', () => {
    const res = optimize('<svg><g><g><rect width="10"/></g></g></svg>', { multipass: true })
    expect(res.data).not.toContain('<g>')
  })

  it('can disable individual plugins', () => {
    const res = optimize('<svg><!-- keep --><rect/></svg>', { removeComments: false })
    expect(res.data).toContain('keep')
  })
})

describe('optimizeMany', () => {
  it('optimizes an array', () => {
    const results = optimizeMany([
      '<svg><!-- x --><rect/></svg>',
      '<svg><title>t</title><circle/></svg>',
    ])
    expect(results).toHaveLength(2)
    expect(results[0].data).not.toContain('x')
    expect(results[1].data).not.toContain('title')
  })
})
