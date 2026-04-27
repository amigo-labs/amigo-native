# Code review — 2026-04-25

Findings from a four-stream audit of the workspace at commit `c100173`. Each
item cites `file:line`. False positives raised by the audit agents are
omitted; the most notable ones are listed at the end.

## P0 — fix before next release

### 1. Decompression-bomb DoS in `inflate`

`crates/inflate/src/lib.rs:55–100, 137–141`. `decompress_bulk` and `ungzip`
grow the output buffer without an upper bound — a 10 MB gzip bomb expands to
hundreds of GB and kills the host process. `inflate`, `inflate_raw`,
`ungzip` are all reachable from untrusted input.

Fix: add a `max_output_size` field to `InflateOptions` (default e.g. 256 MB);
on `BufError` after exceeding it, return a napi error.

### 2. Zip-bomb DoS in `zip`

`crates/zip/src/lib.rs:54–60, 38–52`. `Vec::with_capacity(f.size() as usize)`
trusts the central-directory uncompressed size; a crafted archive can claim
multiple GB per entry and exhaust memory before any read happens. `f.size()`
is also silently truncated with `.min(u32::MAX)` (line 45–46), which loses
information for legitimate >4 GB entries.

Fix: cap the pre-allocation (`min(f.size(), MAX_ENTRY)`) and switch entry
size fields to `BigInt` / `u64` in the napi struct.

### 3. Stale npm platform-stub versions break install for v0.2.0

12 mismatches across `sanitize-html` and `xxhash`: parent `package.json` is
`0.2.0`, every `npm/<target>/package.json` still says `0.1.0`. After
`napi pre-publish` injects `optionalDependencies: { ...: 0.2.0 }`, the stub
versions don't exist on the registry and `npm install` falls through to the
postinstall error path.

Files (each at `version: "0.1.0"`):
- `crates/sanitize-html/npm/{darwin-arm64,darwin-x64,linux-arm64-gnu,linux-x64-gnu,linux-x64-musl,win32-x64-msvc}/package.json`
- `crates/xxhash/npm/{...same six...}/package.json`

Fix: bump all twelve to `0.2.0`. Add a CI check that compares parent vs stub
version (one-liner in `scripts/sync-registry.mjs`).

### 4. CLAUDE.md English-only rule violated by 36 perf-review files

`grep -lP '[äöüÄÖÜß]' docs/perf-review/*.md` returns 36 files containing
German prose (verdicts, classification rationale, use-case sections), e.g.
`docs/perf-review/argon2.md:7`, `docs/perf-review/moment.md:7–36`,
`docs/perf-review/nanoid.md:3–18`. CLAUDE.md explicitly requires English.

The four hits outside `perf-review/` are legitimate Unicode test fixtures
(`crates/slugify/README.md:"Schöne Grüße"`,
`crates/language-detect/README.md:"Der schnelle braune Fuchs"`,
`docs/post-mortems/levenshtein.md:'café'`, comment in
`crates/sentences/src/lib.rs`) — leave those.

### 5. Mutex poisoning crashes `minisearch` and `bm25`

`crates/minisearch/src/lib.rs:117, 126, 133, 181, 209` and
`crates/bm25/src/lib.rs:93, 104, 112, 128` use `.lock().unwrap()`. Any panic
inside the critical section poisons the mutex and every subsequent JS call
throws — the index becomes permanently unusable.

Fix: `.lock().unwrap_or_else(|e| e.into_inner())`, or switch to
`parking_lot::Mutex` which doesn't poison.

## P1 — should fix this sprint

### 6. Missing `__conformance__/parity.spec.ts` in 7 crates

`deepmerge`, `encoding`, `file-type`, `inflate`, `jwt`, `nanoid`, `zip`. The
parity assertions are inlined in `upstream.spec.ts`, and
`test:conformance` is scoped to `fuzz.spec.ts` only — meaning
`pnpm test:conformance` skips parity verification for these seven. The
`audit-crates` skill explicitly flags this as the legacy convention.

Fix: extract a `parity.spec.ts` per crate and change the script to
`vitest run __conformance__`.

### 7. CI lacks Rust supply-chain scanning

No `cargo audit` or `cargo deny` in `.github/workflows/ci.yml`. Vulnerable
transitive crates ship silently. With 30+ crates pulling text-processing,
crypto, PDF, ZIP, and Typst dependencies, this is non-trivial surface.

Fix: add a `lint` step `cargo audit --deny warnings` and an
`.cargo/deny.toml` with at least the `advisories` and `licenses` sections.

### 8. No depth or document-size limit in `sanitize-html`

`crates/sanitize-html/src/v2.rs`. The frame stack (`self.stack`) grows with
every open tag; deeply nested fragments (`<div><div>…×100k…</div></div>`) and
multi-MB inputs are not bounded. html5ever's tokenizer is iterative so this
is heap exhaustion rather than stack overflow, but the failure mode is the
same: process death.

Fix: add `max_depth` (default 256) and `max_input_bytes` to the rules; check
both in the start-tag branch.

### 9. Hardcoded `node-version: 24` in seven workflow steps

`.github/workflows/ci.yml:26, 54, 76, 104, 174` and
`.github/workflows/release.yml:101, 144, 146`. Each Node EOL forces seven
edits in lockstep.

Fix: hoist to `env.NODE_VERSION` at the top of each workflow.

### 10. Artifact-action major-version drift

`ci.yml` uses `actions/upload-artifact@v4` + `download-artifact@v4`,
`release.yml` uses `upload-artifact@v7` + `download-artifact@v8`. Internal
format is compatible today, but the inconsistency is bait for a future
silent failure.

Fix: pin all four to a single major (v4 is the long-term safe choice today).

### 11. `any` types in 13 places leak into the public surface

- `crates/jwt/index.d.ts:5, 14, 16, 22, 25, 44, 45` (`payload`, `expiresIn`,
  `notBefore`, `header`, `VerifyResult.payload`).
- `crates/jose/index.d.ts:12, 13, 23` (`publicJwk`, `privateJwk`, thumbprint
  arg).
- `crates/deepmerge/index.d.ts:8, 10` (merge inputs).

Fix: generic params for jwt (`<P = Record<string, unknown>>`), a `Jwk` type
for jose, `unknown` over `any` for deepmerge.

### 12. CONTRIBUTING.md says Node ≥ 20 while everything else says ≥ 22

`CONTRIBUTING.md:35` vs `package.json:engines.node` and `README.md:74`. New
contributors copy the wrong number.

## P2 — opportunistic

13. `text-splitters` `.unwrap()` on `ChunkConfig::with_overlap` at lines 80,
    94, 102, 116 is currently safe by precondition (`resolved()` validates),
    but a future caller bypassing validation panics the host. Return
    `Result` from the helpers.

14. `sanitize-html` `v2.rs:186` `.pop().expect("frame at idx must exist")`
    is logically safe (`idx` came from `rposition` on the same borrow, then
    `drain(idx + 1..)` leaves index `idx` as the last element) but the
    `expect` message claims an invariant the comment two lines above gets
    wrong (it says `remove(idx)` — actually `drain`). Either delete the
    expect or rewrite the comment.

15. `xxhash` `crates/xxhash/src/lib.rs:11` `b.get_i64().0 as u64` truncates
    silently. If wrapping is intentional add a comment; if not, prefer
    `get_u64`.

16. `docs/app.js:420` writes `await res.text()` to `host.innerHTML`. Source
    is the locally-rendered README (via our own commonmark crate), so it's
    safe — but add a one-line comment so a future reader doesn't add
    user-controlled HTML to the same path.

17. `scripts/new-package.sh:20` `sed -i` replacement of `$NAME` is unsafe
    against `/`, `&`, `\` in the input. Quote/escape or switch to a real
    template engine. Risk is low because crate names are alphanumeric in
    practice.

18. `docs/follow-ups.md:11` references the heading `"Nach-Sprint-Stand"`,
    but the actual heading in `docs/perf-review.md:24` is now
    `## Post-sprint state` — link is stale.

19. Only `sanitize-html/package.json` declares modern `exports`; the other
    30 crates rely on `main`/`types` only. Adopt `exports` repo-wide for
    cleaner subpath imports and ESM/CJS conditionals.

20. `dtolnay/rust-toolchain@stable` floats — fine for trust but a SHA pin
    or a pinned channel (`@1.85.0`) would make builds bit-reproducible.

21. No `renovate.json` or `dependabot.yml`. Adding `dependabot.yml` with
    `cargo`, `npm`, and `github-actions` ecosystems is ~15 lines and pays
    for itself.

22. `vitest.config.ts` has no `pool: 'forks'` — verify napi modules don't
    run into worker-thread re-init issues; current per-crate vitest
    invocations may already work around it via the `--pool=forks` default
    for the root config.

## False positives flagged by the audit (do NOT fix)

- `crates/svgo/src/lib.rs:272–283` `shorten_hex` index access is guarded by
  `if hex.len() == 7` — no OOB possible.
- `crates/jwt/src/lib.rs:294–299` `decode_token` checks `parts.len() < 2`
  before indexing `parts[0]`/`parts[1]` — safe.
- argon2 defaults `m=64 MiB, t=3, p=4` are above OWASP 2023 backend baseline
  for 2026.
- xlsx does not contain the `Vec::with_capacity(f.size())` call the agent
  attributed to it; that line is in `zip`. The xlsx surface delegates to
  `calamine`, which has its own bounds story (worth a separate review, but
  the cited line does not exist).
