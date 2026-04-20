# Doc Follow-ups

Known documentation and per-crate gaps that need attention but were held back
from the main "update docs" sweep because each one needs either a product
decision or real engineering work — not a mechanical rewrite.

Each item lists the concrete artefact that proves it's fixed.

## 1. ~~`docs/perf-review.md` — missing post-ship verdicts~~ ✅ Done

Added rows for bcrypt, commonmark, jose, and tiktoken to the "Nach-Sprint-Stand"
table and updated the "Net:" tally. Portfolio is now **12 Green + 3 Yellow +
1 faktisch-Green (nanoid)** out of 16 shipped crates.

## 2. ~~`@amigo-labs/jwt` — drop-in claim vs. `expiresIn` string limitation~~ ✅ Done

Implemented option (a): `expiresIn` and `notBefore` now accept both numeric
seconds and `ms`-package-compatible strings (`"1h"`, `"2 days"`, `"1.5
hours"`, unit-less = milliseconds). Parser lives in `crates/jwt/src/lib.rs`
(`parse_duration_to_seconds`); `wrapper.js` forwards the raw value instead
of dropping non-numbers. Conformance tests in `__conformance__/upstream.spec.ts`
cross-verify the string path against upstream `jsonwebtoken` for four
representative durations. Root README **Drop-in** label is now honest.

## 3. Conformance docs — partially done

Every shipped crate now has a `__conformance__/README.md` and
`divergences.md` describing the parity scope, plus `parity.spec.ts` and
`fuzz.spec.ts` covering it. What's still missing is a vendored **upstream**
test suite (`upstream.spec.ts` running the package's own tests against our
binding) for most crates.

Only nanoid has this today. Priority order for adding one to other crates:

1. **commonmark** — CommonMark spec tests are a standard corpus; run them
   against `render()`.
2. **jwt** — `jsonwebtoken` has a structured test suite; vendoring it
   would force the `expiresIn`-string question above (item 2).
3. **csv** — `csv-parse` has extensive fixture tests we could redirect.
4. **everything else** — nice to have, not blocking.

**Done when:** a crate's `package.json` has `test:upstream` alongside
`test:conformance` and the `audit-crates` skill reports it as fully
conforming.

## 4. ~~`@amigo-labs/nanoid` — missing `index.d.ts`~~ ✅ Not actually missing

nanoid is pure-JS and ships with `wrapper.js` + `wrapper.d.ts` (see
`crates/nanoid/package.json` — `"types": "wrapper.d.ts"`). The first audit
misread this; the type surface is complete.

## Minor / harmless

These are **not** scheduled — captured only so a future audit doesn't
re-discover them as "new":

- `docs/app.js` `updateIndicator()` runs against a `display: none` element
  (one `getBoundingClientRect` per active change). Dead-but-cheap. Delete if
  the mobile picker ever gets restructured.
- `docs/perf-review.md:48` references `xxh3_128Bytes` as a shipped additive
  API; the crate exports `xxh3_128` only. Either rename in the review doc
  or add the `Bytes` variant.
