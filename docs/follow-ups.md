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

## 3. ~~Conformance docs — partially done~~ ✅ Done

Every shipped crate now has `__conformance__/README.md`,
`divergences.md`, `parity.spec.ts` (or table-driven equivalent),
`fuzz.spec.ts`, **and an `upstream.spec.ts`** that runs either the
upstream package's own tests or the spec's canonical test vectors
against our binding.

Per-crate provenance:

- **commonmark** — full CommonMark 0.31.2 spec (652 cases via the
  `commonmark-spec` npm package). 630 pass; 22 documented divergences
  marked `it.fails` in the spec runner and summarised by section in
  `__conformance__/divergences.md`.
- **jose** — RFC 7638 §3.1 (RSA JWK thumbprint) + RFC 8037 §A.3
  (Ed25519 JWK thumbprint) canonical vectors, plus thumbprint
  determinism invariants.
- **jwt** — cross-verified against upstream `jsonwebtoken` across
  HS/RS/ES/PS/EdDSA sign/verify and the `expiresIn` string-duration
  matrix (see item 2).
- **xxhash** — canonical XXH32/XXH64 vectors from the xxHash v0.8.2
  reference, plus corpus cross-verification against both
  `xxhash-wasm` (reference C via WASM) and `xxhashjs` (pure-JS port).
- **tiktoken** — hardcoded OpenAI reference encodings for cl100k and
  o200k, model-lookup mappings, and `countTokens` / `encodeOrdinary`
  invariants.
- **argon2** — fixed-salt PHC strings produced by upstream `argon2`
  npm verify under our binding, full parameter-matrix cross-verify,
  PHC structural invariants.
- **bcrypt** — pinned OpenWall crypt_blowfish test vectors, full
  corpus cross-verify against both `bcrypt` and `bcryptjs`, 72-byte
  truncation invariants.
- **csv** — RFC 4180 §2.1–§2.7 fixtures + UTF-8 and CRLF cases,
  parity against `csv-parse/sync` on matching option sets,
  `parseWithHeaders ↔ { columns: true }` parity, round-trip tests.
- **slugify** — README-documented examples + corpus parity against
  `slugify({ lower: true, strict: true })`, separator matrix.
- **sanitize-html / nanoid / deepmerge / encoding / file-type /
  inflate / zip** — already had `upstream.spec.ts` from earlier work;
  only docs needed topping up (sanitize-html + slugify README +
  divergences added in the same batch).

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
