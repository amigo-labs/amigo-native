import { describe, it, expect } from 'vitest'
import { parse as upstreamParse } from 'csv-parse/sync'
import { parse, parseWithHeaders, stringify, stringifyObjects } from '../index.js'

/**
 * Upstream conformance — fixtures drawn from `csv-parse`'s own test suite
 * (https://github.com/adaltas/node-csv/tree/master/packages/csv-parse/test),
 * selected to cover the documented core scope of `@amigo-labs/csv`
 * (sync parse + sync stringify; RFC 4180-style CSV).
 *
 * What this file pins:
 *   1. Row-shape parity on a fixed input corpus.
 *   2. Header handling via `parseWithHeaders`.
 *   3. Round-trip parity (parse → stringify → parse) on clean inputs.
 *
 * Intentional scope limits documented in `divergences.md`:
 *   - No cast callbacks, on-record hooks, or stream modes.
 *   - Option names/types differ (byte-code delimiters vs. strings).
 */

// --- Fixed fixtures from csv-parse's test corpus -----------------------
// Each input uses `\n` newlines; the first line is the header so both
// our `parse()` (skipping header by default) and upstream (from_line: 2)
// agree on body shape.

const UPSTREAM_FIXTURES: Array<{ name: string; input: string; expect: string[][] }> = [
  {
    name: 'rfc4180 §2.1 — records separated by line breaks',
    input: 'h1,h2,h3\naaa,bbb,ccc\nxxx,yyy,zzz',
    expect: [
      ['aaa', 'bbb', 'ccc'],
      ['xxx', 'yyy', 'zzz'],
    ],
  },
  {
    name: 'rfc4180 §2.2 — last record may or may not have trailing newline',
    input: 'a,b,c\n1,2,3\n',
    expect: [['1', '2', '3']],
  },
  {
    name: 'rfc4180 §2.5 — fields containing line breaks must be quoted',
    input: 'a,b\n"line1\nline2",x',
    expect: [['line1\nline2', 'x']],
  },
  {
    name: 'rfc4180 §2.6 — fields containing commas must be quoted',
    input: 'a,b\n"x,y",z',
    expect: [['x,y', 'z']],
  },
  {
    name: 'rfc4180 §2.7 — double quotes inside quoted fields are escaped by doubling',
    input: 'a,b\n"he said ""hi""",done',
    expect: [['he said "hi"', 'done']],
  },
  {
    name: 'empty fields preserved',
    input: 'a,b,c\n,,\n1,,3',
    expect: [
      ['', '', ''],
      ['1', '', '3'],
    ],
  },
  {
    name: 'CRLF line endings',
    input: 'a,b\r\n1,2\r\n3,4',
    expect: [
      ['1', '2'],
      ['3', '4'],
    ],
  },
  {
    name: 'UTF-8 non-ASCII fields',
    input: 'name,city\nMüller,München\nRené,Zürich\n',
    expect: [
      ['Müller', 'München'],
      ['René', 'Zürich'],
    ],
  },
]

describe('csv — fixed-expectation fixtures (RFC 4180 + csv-parse corpus)', () => {
  for (const { name, input, expect: expected } of UPSTREAM_FIXTURES) {
    it(`parse: ${name}`, () => {
      const rows = parse(Buffer.from(input))
      expect(rows).toEqual(expected)
    })

    it(`matches upstream csv-parse on: ${name}`, () => {
      const rows = parse(Buffer.from(input))
      const upstream = upstreamParse(input, { columns: false, from_line: 2 })
      expect(rows).toEqual(upstream)
    })
  }
})

// --- parseWithHeaders ↔ csv-parse { columns: true } --------------------

describe('csv — parseWithHeaders matches upstream `columns: true`', () => {
  const fixtures = [
    'id,name,age\n1,Alice,30\n2,Bob,25',
    'key,value\n"has,comma","has\nnewline"',
    'col1,col2,col3\n,,\na,b,c',
  ]
  for (const input of fixtures) {
    it(`columns:true on ${JSON.stringify(input.slice(0, 30))}…`, () => {
      const ours = parseWithHeaders(Buffer.from(input))
      const theirs = upstreamParse(input, { columns: true })
      expect(ours).toEqual(theirs)
    })
  }
})

// --- Round-trip: parse → stringify → parse ----------------------------

describe('csv — round-trip parse/stringify preserves shape', () => {
  const cases = [
    [
      ['name', 'city'],
      ['Alice', 'Austin'],
      ['Bob', 'Barcelona'],
    ],
    [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['', '', ''],
    ],
    [['col'], ['single column']],
  ]
  for (const rows of cases) {
    it(`round-trip: ${rows.length} rows × ${rows[0].length} cols`, () => {
      const encoded = stringify(rows as string[][])
      // our stringify emits a full CSV; when we parse back, the first
      // row becomes the header — strip it to compare body.
      const decoded = parse(Buffer.from(encoded))
      expect(decoded).toEqual(rows.slice(1))
    })
  }
})

describe('csv — stringifyObjects round-trip', () => {
  it('object rows round-trip through stringifyObjects / parseWithHeaders', () => {
    const rows = [
      { name: 'Alice', city: 'Austin' },
      { name: 'Bob', city: 'Barcelona' },
    ]
    const out = stringifyObjects(rows, ['name', 'city'])
    const back = parseWithHeaders(Buffer.from(out))
    expect(back).toEqual(rows)
  })
})
