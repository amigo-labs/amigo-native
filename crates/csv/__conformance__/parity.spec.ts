import { describe, it, expect } from 'vitest';
import { parse as originalParse } from 'csv-parse/sync';
import {
  parse as nativeParse,
  parseWithHeaders as nativeParseWithHeaders,
} from '../index.js';

// Native `parse()` without options treats row 0 as a header (i.e. `hasHeaders: true`).
// So for parity we tell csv-parse to skip the header line with `from_line: 2`.
// Native `parseWithHeaders()` emits objects keyed by the header row.

const BASIC_CASES: Array<{ name: string; input: string }> = [
  { name: 'simple', input: 'a,b,c\n1,2,3\n4,5,6' },
  { name: 'quoted', input: 'a,b\n"hello, world",test' },
  { name: 'quoted newline', input: 'a,b\n"line1\nline2",test' },
  { name: 'escaped quote', input: 'a,b\n"say ""hello""",test' },
  { name: 'empty fields', input: 'a,b,c\n,,\n1,,3' },
  { name: 'single column', input: 'a\n1\n2\n3' },
  { name: 'unicode', input: 'name,city\nMüller,München\nRené,Zürich' },
  { name: 'CRLF', input: 'a,b\r\n1,2\r\n3,4' },
  { name: 'trailing newline', input: 'a,b\n1,2\n' },
];

describe('csv parse parity (body rows, no headers)', () => {
  for (const { name, input } of BASIC_CASES) {
    it(name, () => {
      const originalResult = originalParse(input, {
        columns: false,
        from_line: 2,
      });
      const nativeResult = nativeParse(Buffer.from(input));
      expect(nativeResult).toEqual(originalResult);
    });
  }
});

describe('csv parseWithHeaders parity', () => {
  const HEADER_CASES = [
    'name,age\nAlice,30\nBob,25',
    'a,b,c\n1,2,3',
    'name,city\nMüller,München',
  ];
  for (const input of HEADER_CASES) {
    it(`"${input.slice(0, 40)}"`, () => {
      const originalResult = originalParse(input, { columns: true });
      const nativeResult = nativeParseWithHeaders(Buffer.from(input));
      expect(nativeResult).toEqual(originalResult);
    });
  }
});

describe('csv RFC 4180 compliance', () => {
  it('CRLF as line ending', () => {
    const result = nativeParse(Buffer.from('a,b\r\n1,2\r\n3,4'));
    expect(result).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('double quotes as escape', () => {
    const result = nativeParse(Buffer.from('a\n"he said ""hi"""'));
    expect(result[0][0]).toBe('he said "hi"');
  });

  it('newline inside quoted field', () => {
    const result = nativeParse(Buffer.from('a\n"line1\nline2"'));
    expect(result[0][0]).toBe('line1\nline2');
  });
});
