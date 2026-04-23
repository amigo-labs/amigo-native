import { bench, describe } from 'vitest'
import { generate, generateMany } from '../index.js'

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
  bench('@amigo-labs/pdf generate', () => {
    generate(SIMPLE_LABEL)
  })
})

describe('A4 multi-page report', () => {
  bench('@amigo-labs/pdf generate', () => {
    generate(A4_REPORT)
  })
})

describe('batch 100 labels', () => {
  bench('@amigo-labs/pdf generateMany', () => {
    generateMany(Array.from({ length: 100 }, () => SIMPLE_LABEL))
  })
})
