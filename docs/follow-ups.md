# Doc Follow-ups

Known documentation and per-crate gaps that need attention but were held back
from the main "update docs" sweep because each one needs either a product
decision or real engineering work — not a mechanical rewrite.

Each item lists the concrete artefact that proves it's fixed.

## 1. `docs/perf-review.md` — missing post-ship verdicts

The "Nach-Sprint-Stand" table (lines ~28–45) predates bcrypt, commonmark,
jose, and tiktoken. Each of those has a standalone review under
`docs/perf-review/<name>.md`. The summary table needs one row per package
with its current Green/Yellow/Red/Black verdict, the benchmark range, and
a one-line rationale.

**Done when:** all 16 shipped packages appear in the "Nach-Sprint-Stand" table
and the "Net:" tally one paragraph below matches.

## 2. `@amigo-labs/jwt` — drop-in claim vs. `expiresIn` string limitation

Root [`README.md`](../README.md) marks jwt **Drop-in**, but
[`crates/jwt/MIGRATION.md`](../crates/jwt/MIGRATION.md) documents that string
durations (`"2h"`, `"1d"`) aren't parsed — only numeric seconds. Callers
migrating from `jsonwebtoken` with `{ expiresIn: "1h" }` will fail at runtime.

Resolution is a product call between:

- **(a)** Implement string duration parsing (e.g. via `humantime`) to make
  the drop-in label honest.
- **(b)** Demote the status label to **Compatible** and keep the numeric-only
  contract. Root README cell + package table update.

**Done when:** one of (a) or (b) is shipped and the root README table, the
jwt README, and `MIGRATION.md` all agree on the label.

## 3. Missing conformance suites for drop-in crates

Six packages ship with a "Drop-in" or equivalent status but have no
`__conformance__/upstream.spec.ts` substantiating the claim: argon2, bcrypt,
csv, nanoid, tiktoken, xxhash. The modern pattern (see e.g.
`crates/commonmark/__conformance__/`) is a vendored upstream test suite plus
a `divergences.md` listing the known skips.

Two are the most urgent:

- **xxhash**: official test vectors (xxhsum corpus) would let us prove every
  `*_64`/`*_128` output matches bit-for-bit. Add
  `__conformance__/vectors.spec.ts` from the xxhash repo's test vectors.
- **jose**: RFC 7638 thumbprints and Ed25519 JWK import/export have IETF
  test vectors. Add `__conformance__/rfc7638.spec.ts` + `rfc8037.spec.ts`.

The remaining four (argon2, bcrypt, csv, nanoid) have upstream test suites
that can be vendored via the same shape as the existing
`crates/*/​__conformance__/upstream/` directories.

**Done when:** each crate's `package.json` registers a `test:conformance`
script and the `audit-crates` skill reports no gaps for these six.

## 4. `@amigo-labs/nanoid` — missing `index.d.ts`

The napi-rs auto-generated `index.d.ts` for nanoid is not checked in.
TypeScript consumers get no signatures for `nanoid(size?: number): string` or
`customAlphabet(alphabet: string, size?: number): () => string`. Fix is to
run `pnpm build` in the crate and commit the resulting file, or to hand-write
it if the crate is pure-JS (per
[`docs/perf-review.md:41`](./perf-review.md) nanoid shifted to pure-JS).

**Done when:** `crates/nanoid/index.d.ts` exists and covers every exported
symbol.

## Minor / harmless

These are **not** scheduled — captured only so a future audit doesn't
re-discover them as "new":

- `docs/app.js` `updateIndicator()` runs against a `display: none` element
  (one `getBoundingClientRect` per active change). Dead-but-cheap. Delete if
  the mobile picker ever gets restructured.
- `docs/perf-review.md:48` references `xxh3_128Bytes` as a shipped additive
  API; the crate exports `xxh3_128` only. Either rename in the review doc
  or add the `Bytes` variant.
