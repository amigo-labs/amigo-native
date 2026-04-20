import { bench, describe } from 'vitest'
import { Tiktoken } from '../index.js'

// Three baselines cover the whole competitor landscape:
//  - tiktoken (WASM binding of the same Rust core)
//  - js-tiktoken (pure JS reimplementation)
//  - gpt-tokenizer (pure JS with LRU merge cache + chat helpers)

let wasmTiktoken: typeof import('tiktoken') | null = null
let jsTiktoken: typeof import('js-tiktoken') | null = null
let gptTokenizer: typeof import('gpt-tokenizer/encoding/cl100k_base') | null = null

try {
  wasmTiktoken = await import('tiktoken')
} catch {
  console.warn('tiktoken (WASM) not available, skipping')
}

try {
  jsTiktoken = await import('js-tiktoken')
} catch {
  console.warn('js-tiktoken not available, skipping')
}

try {
  gptTokenizer = await import('gpt-tokenizer/encoding/cl100k_base')
} catch {
  console.warn('gpt-tokenizer not available, skipping')
}

const amigoEnc = Tiktoken.getEncoding('cl100k_base')
const wasmEnc = wasmTiktoken?.get_encoding('cl100k_base') ?? null
const jsEnc =
  jsTiktoken && jsTiktoken.getEncoding
    ? jsTiktoken.getEncoding('cl100k_base')
    : null

const SMALL = 'Hello, world!'
const MEDIUM =
  'The quick brown fox jumps over the lazy dog. '.repeat(40) // ~2 KB, ~500 tokens
const LARGE =
  'The quick brown fox jumps over the lazy dog. '.repeat(2000) // ~90 KB, ~25 k tokens

describe('tiktoken encode — small (10 B)', () => {
  bench('@amigo-labs/tiktoken', () => {
    amigoEnc.encode(SMALL)
  })

  if (wasmEnc) {
    bench('tiktoken (WASM)', () => {
      wasmEnc.encode(SMALL)
    })
  }

  if (jsEnc) {
    bench('js-tiktoken (pure JS)', () => {
      jsEnc.encode(SMALL)
    })
  }

  if (gptTokenizer) {
    const gt = gptTokenizer
    bench('gpt-tokenizer (pure JS)', () => {
      gt.encode(SMALL)
    })
  }
})

describe('tiktoken encode — medium (~2 KB)', () => {
  bench('@amigo-labs/tiktoken', () => {
    amigoEnc.encode(MEDIUM)
  })

  if (wasmEnc) {
    bench('tiktoken (WASM)', () => {
      wasmEnc.encode(MEDIUM)
    })
  }

  if (jsEnc) {
    bench('js-tiktoken (pure JS)', () => {
      jsEnc.encode(MEDIUM)
    })
  }

  if (gptTokenizer) {
    const gt = gptTokenizer
    bench('gpt-tokenizer (pure JS)', () => {
      gt.encode(MEDIUM)
    })
  }
})

describe('tiktoken encode — large (~90 KB)', () => {
  bench('@amigo-labs/tiktoken', () => {
    amigoEnc.encode(LARGE)
  })

  if (wasmEnc) {
    bench('tiktoken (WASM)', () => {
      wasmEnc.encode(LARGE)
    })
  }

  if (jsEnc) {
    bench('js-tiktoken (pure JS)', () => {
      jsEnc.encode(LARGE)
    })
  }

  if (gptTokenizer) {
    const gt = gptTokenizer
    bench('gpt-tokenizer (pure JS)', () => {
      gt.encode(LARGE)
    })
  }
})

describe('tiktoken countTokens — fast-path vs. encode.length', () => {
  bench('@amigo-labs/tiktoken countTokens (medium)', () => {
    amigoEnc.countTokens(MEDIUM)
  })

  bench('@amigo-labs/tiktoken encode(...).length (medium)', () => {
    void amigoEnc.encode(MEDIUM).length
  })

  if (gptTokenizer && 'countTokens' in gptTokenizer) {
    const gt = gptTokenizer as typeof gptTokenizer & {
      countTokens: (t: string) => number
    }
    bench('gpt-tokenizer countTokens (medium)', () => {
      gt.countTokens(MEDIUM)
    })
  }
})

describe('tiktoken encodeMany — 100 small chunks (RAG batch)', () => {
  const chunks = Array.from({ length: 100 }, (_, i) => `chunk ${i}: ${SMALL}`)

  bench('@amigo-labs/tiktoken encodeMany', () => {
    amigoEnc.encodeMany(chunks)
  })

  bench('@amigo-labs/tiktoken encode loop', () => {
    for (const c of chunks) amigoEnc.encode(c)
  })

  if (wasmEnc) {
    bench('tiktoken (WASM) encode loop', () => {
      for (const c of chunks) wasmEnc.encode(c)
    })
  }

  if (gptTokenizer) {
    const gt = gptTokenizer
    bench('gpt-tokenizer encode loop', () => {
      for (const c of chunks) gt.encode(c)
    })
  }
})
