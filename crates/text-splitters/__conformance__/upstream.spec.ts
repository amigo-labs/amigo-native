import { describe, expect, it } from 'vitest'
import { splitText, splitMarkdown } from '../index.js'

// Fixture-style tests modeled on @langchain/textsplitters' README
// examples, with output expectations replaced by compatible shapes.

describe('langchain textsplitters README parity', () => {
  it('splits a doc into approximately chunkSize-sized chunks', () => {
    const text = 'one two three four five six seven eight nine ten'.repeat(20)
    const chunks = splitText(text, { chunkSize: 60, chunkOverlap: 10 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60)
  })

  it('MarkdownTextSplitter-equivalent keeps code blocks together', () => {
    const md = `# Heading

Some text.

\`\`\`python
def add(a, b):
    return a + b
\`\`\`

More text here.
`
    const chunks = splitMarkdown(md, { chunkSize: 300 })
    const hasFullCode = chunks.some(
      (c) => c.includes('```python') && c.includes('return a + b'),
    )
    expect(hasFullCode).toBe(true)
  })
})
