# Candidate review: `pbkdf2`

> **Status:** NO-GO · **Predicted:** 🔴 Red (adoption-driven) · **Reviewed:** 2026-04-19

## Verdict

Same problem as scrypt, only sharper: **Node has `crypto.pbkdf2` built-in as a native C++ implementation** (sync + async, all common hash algos). The ~30M weekly downloads of the npm package `pbkdf2` are **dominantly browser/bundler ecosystem** (`crypto-browserify` shim, Webpack/Browserify polyfills) — server code in 2026 uses `crypto.pbkdf2` directly. Our NAPI crate doesn't reach those bundler users (no browser target) and offers server users no reason to replace Node's built-in. Speedup vs. Node built-in is probably < 1.4×, same code path under the hood (both call OpenSSL/RustCrypto implementations).

## JS package

- **npm:** `pbkdf2` (~30M weekly) — pure JS implementation, primarily as a browserify shim
- **Downloads:** 30M weekly, but **adoption quality low** — almost exclusively a transitive dep
- **Exports / API surface:** `pbkdf2(password, salt, iterations, keyLen, digest, cb)`, `pbkdf2Sync(...)`
- **Typical input:** password + salt; iterations 100,000–600,000 (OWASP 2023 recommendation)
- **Typical output:** key bytes (typically 32 bytes for SHA-256 HMAC)
- **Realistic median use-case:** server Node: `crypto.pbkdf2` (built-in). Browser/edge: `pbkdf2` npm (pure JS). Our crate only hits the server market, so the competitor = Node built-in

## Rust replacement

- **Candidate crate(s):** `pbkdf2` (RustCrypto)
- **Maintenance / license:** RustCrypto, well maintained, MIT/Apache
- **Known gotchas / divergences:** hash-algo selection (SHA1/256/384/512) must explicitly be parity with Node strings (`'sha256'` etc.)

## BACKLOG check

No entry.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 1–50 ms at 100k–600k iter — FFI floor irrelevant |
| Input size distribution | Small (< 128 bytes) |
| Output size distribution | 32 bytes |
| Reusable setup (stateful potential) | None. The HMAC key is set per call |
| Batch-usage realism | N/A |
| FFI-share estimate vs. Rust work | < 0.01% |

**Again no FFI problem.** Pure adoption/competition problem.

## Classification reasoning

Both hard rules apply:

1. **"Realistic median use-case":** server Node code uses `crypto.pbkdf2`. Period. Whoever still uses `pbkdf2` npm directly is either in a browser bundle (unreachable for us) or legacy code.

2. **"No sunk-cost":** even if we measured 1.4× vs. Node built-in — the switching cost (`crypto.pbkdf2` → `@amigo-labs/pbkdf2`) is not worth the marginal gain for most codebases. Argon2 has no built-in competitor; that makes the difference.

Classification **Red** rather than Yellow because:
- adoption path not plausible
- a 1.4× marginal gain would be the argon2 pattern, but argon2 has no built-in as the default choice
- our bundle size (~1 MB binary + 6 platform stubs) vs. Node built-in (0 bytes install) is a no-brainer

## If GO — proposed port

**Not recommended.** If someone insists:
- pitch only as "explicitly tested cross-platform consistency" (Node built-in uses the OS's OpenSSL variant, RustCrypto is deterministic)
- bench gate: ≥1.8× vs. `crypto.pbkdf2` at 100k iter — otherwise out

## If NO-GO — BACKLOG entry

```markdown
- **pbkdf2** (~30M weekly). Node has `crypto.pbkdf2` built-in as a native OpenSSL implementation (sync + async, all hash algos). The 30M downloads number is dominantly browser bundler shim (`crypto-browserify`), not real server adoption. Our NAPI crate reaches neither browser users nor gives server users a reason to replace Node's built-in. Structurally harder pitch than scrypt (same logic but pbkdf2 server adoption is even more clearly built-in-dominated).
```

Section in `BACKLOG.md`: **FFI overhead > gain** (variant: "Node built-in dominates; npm downloads are bundler shim")
