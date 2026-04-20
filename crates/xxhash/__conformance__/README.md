# Conformance — `@amigo-labs/xxhash`

Verifies that `@amigo-labs/xxhash` produces bit-for-bit identical output to
the canonical XXHash reference implementations. xxhash is a deterministic
non-cryptographic hash — "conformance" here means every output is provably
correct, not merely stable.

## What's checked

- **`parity.spec.ts`** — three layers of cross-verification:
  1. **Canonical test vector** from the xxhash specification
     (`xxh32("", seed=0) === 0x02CC5D05`). Proves the algorithm matches the
     reference.
  2. **Cross-verification against `xxhash-wasm`** (upstream WASM binding)
     on a corpus of ASCII, multibyte UTF-8, emoji, binary, and long inputs.
     All three variants (XXH32, XXH64, XXH3) must agree on every input.
  3. **Cross-verification against `xxhashjs`** (pure-JS baseline) on the
     same corpus.
- **Streaming parity** — the `Xxh3Hasher` streaming output equals the
  one-shot output for any chunking of the input.
- **Determinism** — 1000 repeat calls on the same input yield the same hash;
  distinct seeds produce distinct hashes.
- **Output shape** — `xxh3_128` emits 32-char lowercase hex; `digestHex()`
  emits 16-char lowercase hex.
- **`fuzz.spec.ts`** — property-based invariants across random inputs.

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/xxhash test:conformance

# or per-package:
cd crates/xxhash && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/xxhash test:all
```

## Updating

Test vectors for xxhash are fixed (the algorithm is versioned and stable).
Update the `devDependency` versions of `xxhash-wasm` and `xxhashjs` only
when they release a new version; their output must not change unless a
CVE-grade bug was fixed. In that case, decide which side is right and
record any divergence in [`divergences.md`](./divergences.md).
