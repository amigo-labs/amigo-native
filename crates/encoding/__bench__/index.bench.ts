import { bench, describe } from 'vitest'
import { encode as amigoEncode, decode as amigoDecode } from '../index.js'
import * as iconv from 'iconv-lite'

const small = 'café résumé naïve '.repeat(10) // ~160B
const medium = 'café résumé naïve '.repeat(6000) // ~100KB
const large = 'café résumé naïve '.repeat(600_000) // ~10MB

const largeBytes = Buffer.from(large, 'utf-8')

describe('encoding — encode utf-8 (small/medium/large)', () => {
  bench('@amigo-labs/encoding small', () => {
    amigoEncode(small, 'utf-8')
  })
  bench('iconv-lite small', () => {
    iconv.encode(small, 'utf-8')
  })
  bench('Buffer.from small', () => {
    Buffer.from(small, 'utf-8')
  })

  bench('@amigo-labs/encoding 100KB', () => {
    amigoEncode(medium, 'utf-8')
  })
  bench('iconv-lite 100KB', () => {
    iconv.encode(medium, 'utf-8')
  })
  bench('Buffer.from 100KB', () => {
    Buffer.from(medium, 'utf-8')
  })

  bench('@amigo-labs/encoding 10MB', () => {
    amigoEncode(large, 'utf-8')
  })
  bench('iconv-lite 10MB', () => {
    iconv.encode(large, 'utf-8')
  })
  bench('Buffer.from 10MB', () => {
    Buffer.from(large, 'utf-8')
  })
})

describe('encoding — decode utf-16le 100KB', () => {
  const utf16 = iconv.encode(medium, 'utf-16le')
  bench('@amigo-labs/encoding', () => {
    amigoDecode(utf16, 'utf-16le')
  })
  bench('iconv-lite', () => {
    iconv.decode(utf16, 'utf-16le')
  })
})

describe('encoding — decode shift_jis 100KB', () => {
  const sjis = iconv.encode('こんにちは '.repeat(10_000), 'shift_jis')
  bench('@amigo-labs/encoding', () => {
    amigoDecode(sjis, 'shift_jis')
  })
  bench('iconv-lite', () => {
    iconv.decode(sjis, 'shift_jis')
  })
})

describe('encoding — decode latin1 10MB', () => {
  bench('@amigo-labs/encoding', () => {
    amigoDecode(largeBytes, 'latin1')
  })
  bench('iconv-lite', () => {
    iconv.decode(largeBytes, 'latin1')
  })
})
