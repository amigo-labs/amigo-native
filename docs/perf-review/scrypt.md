# Candidate review: `scrypt`

> **Status:** NO-GO (for now) · **Predicted:** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

scrypt looks superficially like an argon2 sibling (memory-hard KDF, ms-scale compute, identical API shape) — **but Node has had `crypto.scrypt` built-in as native C++ code since v10.5**. The realistic median competition in server code isn't `scrypt-js`, it's Node itself. Expected speedup vs. Node built-in: ~1.4× (analogous to argon2 vs. argon2-npm), that **misses the 2× Green gate**. Adoption argument weak: why would a server dev install our crate when `crypto.scrypt` is already native? No GO without an adoption path.

## JS package

- **npm:** `scrypt` (deprecated, abandoned), `scrypt-js` (~3M weekly, pure JS, browser-focused)
- **Downloads:** 3M weekly (scrypt-js); server users use `crypto.scrypt` (built-in since Node 10.5)
- **Exports / API surface:** `scrypt(password, salt, N, r, p, dkLen)` → derived key bytes
- **Typical input:** password + salt (≤ 64 bytes each); parameters N=16384/32768, r=8, p=1
- **Typical output:** key bytes (typically 32–64 bytes)
- **Realistic median use-case:** **server-side**: `crypto.scrypt` (built-in C++). **Browser/edge**: `scrypt-js` (pure JS). Our NAPI crate only runs in Node server, so the honest baseline is `crypto.scrypt`

## Rust replacement

- **Candidate crate(s):** `scrypt` (RustCrypto, mature, MIT/Apache)
- **Maintenance / license:** RustCrypto family, well maintained
- **Known gotchas / divergences:** parameter encoding conventions vary (N as log₂ vs. raw); MCF hash format `$scrypt$...` standardized via `scrypt-pw` helper

## BACKLOG check

No entry. But should probably land there with a clear rationale.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 50–200 ms at N=16384 — FFI floor irrelevant |
| Input size distribution | Small (password + salt < 128 bytes); string/buffer conversion < 0.01% |
| Output size distribution | 32–64 bytes key — irrelevant |
| Reusable setup (stateful potential) | None. Parameters per call |
| Batch-usage realism | N/A (each call needs an independent salt) |
| FFI-share estimate vs. Rust work | < 0.001% at standard parameters |

**FFI is not the problem.** The algorithm is Rust-friendly. The problem is the **JS competition choice**.

## Classification reasoning

Applying **Hard Rule 1** ("realistic median use-case") hits hard here:

- vs. `scrypt-js` (pure JS): probably 5–10× speedup → Green
- vs. `crypto.scrypt` (Node built-in native): probably ~1.4× speedup (analogous to the argon2 pattern) → **Yellow** (misses 2× gate)

Server code in 2026 almost always uses `crypto.scrypt`. The `scrypt-js` downloads are dominantly browser/bundler ecosystem (browserify shim, edge-runtime libs) — that's **our crate structurally can't reach those users**, because a NAPI binary doesn't run in the browser.

Unlike argon2/bcrypt: Node has **no** built-ins for those. There our crate is the canonical native option.

## If GO — proposed port

**Only makes sense if:**
1. Bench against `crypto.scrypt` shows unexpected ≥2× (e.g. because Node's libuv async wrapper adds overhead) — **must be measured before porting**
2. Or: conscious pitch as a "sync API without libuv roundtrip" for hot paths (Node's sync variant exists, but blocks the event loop)

Otherwise no GO.

## If NO-GO — BACKLOG entry

```markdown
- **scrypt** / **scrypt-js** (~3M weekly). Node has `crypto.scrypt` built-in as a native C++ implementation. Realistic-median competitor is the Node built-in, not scrypt-js. Expected speedup ~1.4× (see argon2 pattern), misses 2× Green gate. scrypt-js downloads are primarily browser/bundler ecosystem — structurally unreachable for our NAPI crate. Re-evaluate if a bench against `crypto.scrypt` shows ≥2×.
```

Section in `BACKLOG.md`: **FFI overhead > gain** (variant: "Node built-in dominates")
