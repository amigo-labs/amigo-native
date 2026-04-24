# Divergences — language-detect

`@amigo-labs/language-detect` targets `franc`-compatible shape (ISO-639-3
codes, `min_length`-gate, allow/deny lists) but uses `whatlang` as its
engine. The two libraries agree on the dominant-language question for
paragraph-sized inputs of mainstream Latin-script languages, and diverge
on short inputs, smaller language families, and confidence-score shape.

## Language coverage

- **Upstream:** `franc-all` knows 414 languages; `franc-min` knows 82.
- **@amigo-labs/language-detect:** `whatlang` knows 87 languages —
  effectively a superset of `franc-min` with a few additions/removals.
  Rare languages (Klingon, constructed languages, historical scripts)
  that exist in `franc-all` are **not** supported.
- **Migration:** apps using `franc-all` on uncommon languages will see
  those inputs return `'und'`. This is by design: `lingua-rs` (the only
  Rust library with `franc-all`-like coverage) ships with a 100+ MB
  model binary per target, which doesn't fit the portfolio's size
  policy (`docs/perf-review/franc.md`).

## Confidence score

- **Input:** any text
- **Upstream:** `franc.all(...)` returns trigram match scores in an
  implementation-specific range.
- **@amigo-labs/language-detect:** `detectAll(...)` returns
  `whatlang`'s confidence in `[0, 1]`.
- **Why:** the scores are fundamentally not comparable between engines.
- **Workaround:** if you threshold on `franc`'s score, switch to
  `whatlang`'s `[0, 1]` scale and re-tune.

## Short input reliability

- **Input:** strings shorter than ~50 bytes
- **Upstream:** `franc` always returns a best-guess code.
- **@amigo-labs/language-detect:** `detect(...)` returns `'und'` when
  the input is below `min_length` (default 10 bytes). Use
  `detectIfLong(...)` (returns `null`) for code that would rather say
  "don't know" than guess.
- **Why:** at <50 bytes, no trigram-based detector is reliable. We
  expose the guard explicitly rather than pretending otherwise.
