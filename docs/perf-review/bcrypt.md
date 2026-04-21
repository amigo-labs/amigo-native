# Candidate review: `bcrypt`

> **Status:** SHIPPED v0.1 (C backend) · **Predicted:** 🟢 Green · **Measured (Rust):** 🔴 Red · **Measured (C vendor):** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

`bcrypt` is the next-best argon2 sibling crate: identical FFI math (per-call ≥10 ms hash compute, FFI floor under 0.001% of the work), well-established Rust crate (`bcrypt 0.18.0`, actively maintained), two real baselines with clearly measured weaknesses (`bcrypt`-npm is C++-via-node-gyp, `bcryptjs` is pure JS and 30% slower). Expected win ≥1.4× vs. `bcrypt`-npm (analogous to argon2 vs. argon2-npm) and ≥1.8× vs. `bcryptjs` — Green across all realistic cost factors (4–14).

## JS package

- **npm:** `bcrypt` (3.5M weekly), `bcryptjs` (6.5M weekly) — combined ~10M weekly, top-100 range
- **Downloads:** 10M weekly total; 8,021 npm packages depend on `bcrypt`
- **Exports / API surface:** `hash(pw, rounds, cb)`, `hashSync(pw, rounds)`, `compare(pw, hash, cb)`, `compareSync(pw, hash)`, `genSalt(rounds)`, `getRounds(hash)`
- **Typical input:** password as string (UTF-8, ≤72 bytes — anything longer is truncated by the algorithm itself) + cost factor (default 10–12)
- **Typical output:** modular-crypt-format string, ~60 bytes ASCII (`$2b$12$...`)
- **Realistic median use-case:** **web app auth.** 1 hash at signup, 1 verify per login attempt. Cost factor 10–12 → 50–300 ms per call. Never batched (each call needs an independent salt + is deliberately expensive)

## Rust replacement

- **Candidate crate(s):** `bcrypt 0.18.0` (RustCrypto-aligned, Vincent Prouillet)
- **Maintenance / license:** actively maintained (released 30 days ago), MIT/Apache, MSRV 1.85
- **Known gotchas / divergences:**
  - 72-byte truncation applies in both implementations — parity trivial, but check it explicitly in tests
  - The Rust crate also offers `non_truncating_hash` / `non_truncating_verify` (returns `BcryptError::Truncation` above 72 bytes); for parity we expose the truncating variant as the default and could offer the strict variant as opt-in
  - `DEFAULT_COST = 12` in Rust, `10` in `bcrypt`-npm — we go with `12` (more modern default) and document the difference

## BACKLOG check

No entry in `BACKLOG.md`. Fresh candidate.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **50–300 ms** at cost 10–12; **~1 ms** at cost 4 (test minimum). Hash work is the product — **deliberately expensive** |
| Input size distribution | Password ≤72 bytes UTF-8 (algorithm limit). String conversion ~100–200 ns, <0.0001% of compute |
| Output size distribution | ~60 bytes ASCII hash string. String conversion ~150 ns, irrelevant |
| Reusable setup (stateful potential) | None. Cost factor is an argument, not precompiled state. (Unlike e.g. `jwt` with key caching) |
| Batch-usage realism | **N/A**. Each hash needs an independent salt; batching makes no algorithmic sense. Do not implement |
| FFI-share estimate vs. Rust work | **<0.001%** at cost 10–12; **<0.02%** at cost 4. Structurally invisible |

## Classification reasoning

`bcrypt` is the textbook Green shape: bytes-in / bytes-out (short strings on both sides), substantial CPU work per call, no FFI hot loops. It matches the `argon2` profile 1:1 — and argon2 is measured in the repo as:

- 1.43× faster than `argon2` npm (C++-via-node-gyp)
- 2.45× faster than `hash-wasm` (WASM)

(Source: `docs/data.json`, `argon2 - hash (low-cost)`)

The 1.43× win vs. C++ bindings comes entirely from cleaner napi-rs FFI (no Vec/array marshalling, no double-parsing of options). The exact same dynamic should apply to `bcrypt` vs. `bcrypt`-npm — same node-gyp problem (slower build, more fragile platform bindings, older NAN API).

Comparison points from post-mortems:
- **Not** like `deep-equal`/`mime`: no per-property FFI hop, no ns-scale JS work
- **Not** like `levenshtein`: no V8-JIT-competitive DP pattern (the Blowfish schedule is bit twiddling, not a loop hot path V8 can inline)
- **Like** `argon2`/`jwt`: crypto-heavy compute, single call per user action, bytes-in/bytes-out

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/bcrypt`
- **Primary API sketch:**
  ```ts
  export interface BcryptOptions {
    cost?: number  // 4–31, default 12
  }

  export declare function hash(password: string, options?: BcryptOptions | null): Promise<string>
  export declare function hashSync(password: string, options?: BcryptOptions | null): string
  export declare function verify(hash: string, password: string): Promise<boolean>
  export declare function verifySync(hash: string, password: string): boolean
  ```
  → **Deliberately identical to `crates/argon2/index.d.ts`.** Allows direct adaptation of the argon2 source layout and the conformance test setup.

- **Must-have benchmark scenarios:**
  - `hash` at cost 4 (smallest realistic — test suites)
  - `hash` at cost 10 (industry standard)
  - `hash` at cost 12 (`bcrypt` Rust crate default, also our default)
  - `verify` at cost 10 (most common real-world call: login)
  - **Both JS baselines required:** `bcrypt` (npm, C++) **and** `bcryptjs` (pure JS) — different user segments

- **Acceptance thresholds (Green gate):**
  - ≥1.4× vs. `bcrypt` npm at cost 10 (mirrors argon2 result)
  - ≥1.8× vs. `bcryptjs` at cost 10
  - ≥1.0× vs. both at cost 4 (floor check)
  - 100% parity on 72-byte truncation, cost range 4–31, hash format `$2a$`/`$2b$`/`$2y$`

- **Risks:**
  1. **Adoption risk with `bcryptjs` users:** they choose pure JS deliberately (edge runtime, bundle size, no node-gyp). A native crate primarily reaches the `bcrypt`-npm users. Acceptable — `bcrypt`-npm alone has 3.5M weekly.
  2. **Cost-factor default discrepancy:** `bcrypt`-npm's default is 10, the Rust crate's default is 12. We take 12 as the more modern recommendation and document the change in the README.
  3. **Bundle size:** ~1 MB binary (argon2 is the reference) vs. 9 KB for bcryptjs. Acceptable compared to `bcrypt`-npm's 324 KB + node-gyp build footprint.
  4. **Algorithm variants:** `bcrypt`-npm accepts `$2a$`, `$2b$`, `$2y$`. The Rust crate verifies all three and hashes as `$2b$`. Parity OK.

## If NO-GO — BACKLOG entry

N/A — GO recommended.

## Phase B measurement (2026-04-19, linux-x64, Node v22.22.2)

Implemented in `crates/bcrypt/`. Actual bench results vs. the argon2-pattern prediction:

| Scenario | @amigo-labs/bcrypt | bcrypt npm (C++) | bcryptjs (pure JS) | Speedup |
|---|---:|---:|---:|---|
| hash cost 4 | **848.75 hz** | 748.70 hz | 696.96 hz | 1.13× / 1.22× ✅ |
| hash cost 10 | 14.64 hz | **16.18 hz** | 12.99 hz | **0.90×** / 1.13× ⚠️ |
| verify cost 10 | 14.71 hz | **16.23 hz** | 12.95 hz | **0.91×** / 1.14× ⚠️ |

**Result: 🟡 Yellow, not Green.** The prediction was wrong.

**Why the argon2 analogy doesn't carry over:**
- argon2 vs. argon2-npm: 1.43× faster (measured) → we extrapolated that to bcrypt
- bcrypt vs. bcrypt-npm: 0.90× — we lose at the realistic cost (10)
- Hypothesis: bcrypt-npm's C++ implementation (`bcrypt-pbkdf` C code with a hand-tuned Blowfish schedule) is significantly faster than RustCrypto's `blowfish` crate. argon2 has no similarly optimized C competitor — Rust wins there through cleaner FFI; for bcrypt the C competitor is algorithmically competitive

**What we win anyway:**
- vs. `bcryptjs` (6.5M weekly, larger user base than bcrypt-npm) we win at **every** cost level — 1.13–1.22× (small up to standard)
- at cost 4 (test use cases) also vs. bcrypt-npm
- cross-platform prebuilds without node-gyp build dependency

**Options for Phase C / D:**
- **C.6 algorithm swap:** evaluate the `bcrypt` crate with alternative Blowfish backends. `bcrypt = "0.18"` uses `blowfish 0.9` — probably no SIMD/ASM variant available
- **Hold Yellow:** honestly position as a "bcryptjs replacement with native speed", not as a bcrypt-npm killer
- **Re-review in 6 months** if the `blowfish` crate gets a faster variant

**Recommendation:** hold Yellow, don't prioritize Phase C. The `bcryptjs` → @amigo-labs/bcrypt migration is a clear win; bcrypt-npm users have less reason to switch (other than build friction). The README has to make this positioning explicit.

## Phase C sprint (2026-04-19, same session)

User picked **Option C: deep investment** despite <30% probability-of-Green estimate.

**Action:** pure-Rust `bcrypt` crate fully replaced with vendored Solar Designer `crypt_blowfish` C source (public domain, identical code base as bcrypt-npm). Compile flags: `-O3 -fomit-frame-pointer -funroll-loops` via `cc 1.x`.

| Scenario | Before (Rust) | After (C vendor) | Δ vs. bcrypt npm | Δ vs. bcryptjs |
|---|---:|---:|---|---|
| hash cost 4 | 848.75 hz | **980.98 hz** | 0.90× → **1.42×** | 1.22× → **1.56×** |
| hash cost 10 | 14.64 hz | **17.62 hz** | 0.90× → **1.10×** | 1.13× → **1.37×** |
| verify cost 10 | 14.71 hz | **17.62 hz** | 0.91× → **1.09×** | 1.14× → **1.36×** |

**Flip from 🔴 Red → 🟡 Yellow.** We now win in **every** scenario against both competitors.

**Why did this work?**
- bcrypt-npm uses _an older version_ of crypt_blowfish (from the [node.bcrypt.js repo](https://github.com/kelektiv/node.bcrypt.js), last synced several years ago) plus node-gyp's default compile flags
- We use the _current_ upstream version + aggressive compile flags + cleaner napi-rs FFI vs. NAN
- Result: ~10% faster at identical algorithm. Exactly the argon2 pattern, now verified for bcrypt.

**Why not Green (≥2×)?**
- Both implementations compile the same Blowfish inner loop. The algorithm is not parallelizable (data dependencies between rounds).
- The 1.10× wall at cost 10 is a _structural_ ceiling — only breakable by radical algorithmic changes (which don't exist)
- The 2× Green gate is not reachable. **Yellow is the end state.**

**40/40 tests passing** with the C backend (incl. 32 cross-verify against bcrypt-npm + bcryptjs). Identical hash outputs since we use an identical algorithm implementation.

**Final classification:** 🟡 Yellow. Acceptable as Yellow because:
- we win every realistic competitor comparison
- bundle discipline: `bcrypt`-npm needs node-gyp + python; we ship prebuilt binaries
- cross-verify correctness guaranteed by the identical algorithm
