import { bench, describe } from 'vitest'
import { generate, generateMany } from '../index.js'

// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmGenerate: typeof generate | null = null
let wasmGenerateMany: typeof generateMany | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_pdf_wasm.js')
  wasmGenerate = mod.generate
  wasmGenerateMany = mod.generateMany
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
const SIMPLE_LABEL = {
  pages: [
    {
      width: 100,
      height: 50,
      elements: [
        {
          kind: 'text',
          text: { kind: 'text', x: 10, y: 25, text: 'Label', fontSize: 12 },
        },
      ],
    },
  ],
}

const A4_REPORT = {
  pages: Array.from({ length: 5 }, () => ({
    width: 210,
    height: 297,
    elements: Array.from({ length: 30 }, (_, i) => ({
      kind: 'text',
      text: {
        kind: 'text',
        x: 20,
        y: 280 - i * 8,
        text: `Line ${i} with some filler content`,
        fontSize: 10,
      },
    })),
  })),
}

describe('simple label', () => {
  bench('@amigo-labs/pdf (napi) generate', () => {
    generate(SIMPLE_LABEL)
  })
  if (wasmGenerate) bench('@amigo-labs/pdf (wasm) generate', () => { wasmGenerate!(SIMPLE_LABEL) })
})

describe('A4 multi-page report', () => {
  bench('@amigo-labs/pdf (napi) generate', () => {
    generate(A4_REPORT)
  })
  if (wasmGenerate) bench('@amigo-labs/pdf (wasm) generate', () => { wasmGenerate!(A4_REPORT) })
})

describe('batch 100 labels', () => {
  bench('@amigo-labs/pdf (napi) generateMany', () => {
    generateMany(Array.from({ length: 100 }, () => SIMPLE_LABEL))
  })
})
