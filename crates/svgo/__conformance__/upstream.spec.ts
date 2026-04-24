// Upstream svgo ships a Vitest suite that tests each plugin in
// isolation against fixture pairs. We can't point them at our binding
// without forking the fixture harness — instead, we run svgo's
// documented preset-default plugin surface against our implementation
// via fixture shapes and check that the direction-of-effect matches.

import { describe, expect, it } from 'vitest'
import { optimize } from '../index.js'

describe('upstream preset-default surface', () => {
  const fixtures: Array<[string, string, (out: string) => boolean]> = [
    ['removeComments', '<svg><!-- c --><rect/></svg>', (s) => !s.includes('<!--') && !s.includes('-->')],
    ['removeDoctype', '<!DOCTYPE svg><svg><rect/></svg>', (s) => !s.includes('DOCTYPE')],
    ['removeMetadata', '<svg><metadata>m</metadata><rect/></svg>', (s) => !s.includes('metadata')],
    ['removeTitle', '<svg><title>t</title><rect/></svg>', (s) => !s.includes('title')],
    ['removeDesc', '<svg><desc>d</desc><rect/></svg>', (s) => !s.includes('desc')],
    ['removeEmptyAttrs', '<svg><rect id="" width="1"/></svg>', (s) => !s.includes('id=')],
    ['removeEmptyContainers', '<svg><g></g><rect/></svg>', (s) => !s.includes('<g')],
    ['removeUselessDefs', '<svg><defs></defs><rect/></svg>', (s) => !s.includes('defs')],
    ['cleanupNumericValues', '<svg><rect width="1.00000"/></svg>', (s) => s.includes('"1"')],
    ['collapseGroups', '<svg><g><rect width="1"/></g></svg>', (s) => !s.includes('<g>')],
    ['convertColors', '<svg><rect fill="black"/></svg>', (s) => s.includes('#000')],
  ]

  for (const [plugin, input, check] of fixtures) {
    it(`${plugin}: effect applied`, () => {
      const out = optimize(input).data
      expect(check(out)).toBe(true)
    })
  }
})
