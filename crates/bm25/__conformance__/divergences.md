# Divergences — bm25

`@amigo-labs/bm25` implements standard BM25 (k1, b) with defaults
k1=1.5, b=0.75. Top-hit selection should match other BM25
implementations on the same tokenization, but score magnitudes
differ by a constant factor depending on the IDF variant.

## IDF variant

We use the "Robertson-Sparck Jones" variant:

```
idf = ln((N - df + 0.5) / (df + 0.5) + 1)
```

The `+1` inside the `ln` prevents negative scores on terms appearing
in >N/2 documents, matching the "Okapi BM25+" refinement. `okapibm25`
npm uses the same formula.

## Tokenisation differences from wink-bm25-text-search

- wink-bm25-text-search uses its own stemming + stopword pipeline.
- We use a simple lowercase + split-on-non-alphanumeric tokenizer
  plus an optional English stopword pass.
- For German/French text we keep the original word (no stemming).
  Exact stemming parity with wink's porter stemmer is out of scope.

## API differences

### No per-document boost

wink-bm25-text-search supports per-document weight via
`config.fldWeights`. We treat all documents equally. Add a prefix
token to boost-eligible docs if you need this.

### No multi-field index

We treat each document as one text field. Multi-field support
(title weighted 3×, body weighted 1×) is deferred to v0.2. For
now, concatenate boosted text: `title + " " + title + " " + title + " " + body`.

### No auto-save/auto-load

Neither `Bm25Index.toJSON()` nor `fromJSON()` are exposed in v0.1.
Rebuild the index from your corpus on startup. For very large
corpora (>1M docs), file-back-able persistence is fast-follow.

### No query-time stopword toggle

Stopword filtering is a constructor flag — it's applied consistently
on both index-time and query-time tokens. Changing it mid-flight
would invalidate the index.

## Scoring behaviour

- Queries with **zero matching terms** return `[]`, not a zero-score
  list of all docs.
- Multi-term queries **sum** BM25 per-term scores (not multiply).
- Terms not in the index contribute **zero** to the score (not
  rejected).
- Ties are broken by **insertion order** (first-added wins).
