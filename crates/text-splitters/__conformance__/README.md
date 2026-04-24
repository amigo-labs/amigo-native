# Conformance — `@amigo-labs/text-splitters`

## Files

- `parity.spec.ts` — head-to-head with `@langchain/textsplitters`
  `RecursiveCharacterTextSplitter`. Both produce non-empty chunks,
  both respect chunkSize, reassembly preserves input content.
- `upstream.spec.ts` — langchain-README-style examples, including
  markdown-aware code-block preservation.
- `fuzz.spec.ts` — property-based: no panics, each chunk ≤ chunkSize.
- `divergences.md` — documented gaps.

## Running

```bash
pnpm --filter @amigo-labs/text-splitters test:conformance
```

## Parity scope

The `RecursiveCharacterTextSplitter` and `MarkdownTextSplitter` are
the primary surface (~80% of langchain usage). `TokenTextSplitter`
is replaced by the `lengthMetric: 'tiktoken:*'` option on the
recursive splitter.
