import { describe, it, expect } from 'vitest'
import { parse, parseWithHeaders, parseToJson, countRows, stringify, stringifyObjects } from '../index.js'

describe('csv', () => {
  it('parse basic CSV', () => {
    const result = parse(Buffer.from('a,b,c\n1,2,3\n4,5,6'))
    expect(result).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
  })

  it('parse with headers', () => {
    const result = parseWithHeaders(Buffer.from('name,age\nAlice,30\nBob,25'))
    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })

  it('custom delimiter', () => {
    const result = parse(Buffer.from('a;b\n1;2'), { delimiter: 59, hasHeaders: true })
    expect(result).toEqual([['1', '2']])
  })

  it('quoted fields', () => {
    const result = parse(Buffer.from('a,b\n"hello, world",test'), { hasHeaders: true })
    expect(result[0][0]).toBe('hello, world')
  })

  it('stringify rows', () => {
    const result = stringify([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(result.trim()).toBe('a,b\n1,2')
  })

  it('stringifyObjects', () => {
    const result = stringifyObjects(
      [
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ],
      ['name', 'age'],
    )
    expect(result.trim()).toBe('name,age\nAlice,30\nBob,25')
  })

  it('handles empty input', () => {
    const result = parse(Buffer.from(''))
    expect(result).toEqual([])
  })

  it('trim fields', () => {
    const result = parse(Buffer.from('a,b\n 1 , 2 '), {
      hasHeaders: true,
      trimFields: true,
    })
    expect(result[0]).toEqual(['1', '2'])
  })

  it('countRows', () => {
    const count = countRows(Buffer.from('a,b\n1,2\n3,4\n5,6'))
    expect(count).toBe(3)
  })

  it('parseToJson matches parse', () => {
    const input = Buffer.from('a,b,c\n1,2,3\n4,5,6')
    const fromParse = parse(input)
    const fromJson = JSON.parse(parseToJson(input))
    expect(fromJson).toEqual(fromParse)
  })

  it('parseToJson handles quotes and escapes', () => {
    const input = Buffer.from('a,b\n"hello, ""world""",test')
    const result = JSON.parse(parseToJson(input))
    expect(result[0][0]).toBe('hello, "world"')
  })

  it('large file performance', () => {
    const rows = Array.from({ length: 100000 }, (_, i) => `${i},name${i},${i * 1.5}`)
    const csv = 'id,name,value\n' + rows.join('\n')
    const start = performance.now()
    parse(Buffer.from(csv))
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
