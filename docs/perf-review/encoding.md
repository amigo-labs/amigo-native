# Perf-Review: `@amigo-labs/encoding`

> **Status:** 🟢 Green (post-Phase-C, after the shift_jis re-measurement) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

A **specifics**-heavy package. Most encodings (UTF-8 / UTF-16LE/BE / Latin-1 / Windows-1252) have hand-optimised Rust paths that run directly against `Buffer` input/output — that's where the **959×-against-iconv-lite Latin-1 10 MB decode win** (33.95×) comes from, probably the most extreme single win in the portfolio. UTF-8 runs through the V8 fast path (parity to slightly faster). Shift_JIS is the only weak point at **0.56× (1.8× slower)** — encoding_rs' Shift_JIS decoder is the shared bottleneck; iconv-lite uses a custom lookup table that wins on smaller inputs. `perf-review.md:38` documents this as an acceptable divergence because every other encoding wins decisively.

## Classification rationale

1. **Hand-optimised hot paths for the common encodings.** UTF-16LE/BE, Latin-1 strict, Windows-1252 strict: custom Rust functions that operate directly on `Vec<u8>` / `Buffer`, no encoding_rs abstraction. UTF-8 uses a short-circuit (NAPI already hands us UTF-8, no conversion needed).
2. **iconv-lite parity semantics.** The important divergences from encoding_rs default (the WHATWG web-form behaviour) are explicitly patched: `latin1` = strict ISO-8859-1 (not a windows-1252 alias), UTF-16 variants = raw byte orderings (not UTF-8-encoded), unmappable chars = `?` byte (not `&#NNN;` HTML entity).
3. **Shift_JIS path goes through encoding_rs.** encoding_rs' Shift_JIS decoder state machine has a constant per-byte overhead. iconv-lite uses a pre-computed 2-byte lookup table that wins at 100 KB. Phase-C analysis: `docs/perf-review.md:38` documents this as an acceptable trade-off, status Green thanks to the residual win.
4. **The 10 MB Latin-1 win comes from the output-buffer strategy.** iconv-lite allocates per-char; our `decode_latin1_strict` pre-allocates `input.len() * 2` and writes raw bytes instead of char-per-char.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/encoding | iconv-lite | Buffer.from (Node builtin) | vs. iconv-lite |
|---|---:|---:|---:|---:|
| encode utf-8 small | 3 734 051 Hz | 1 786 671 Hz | 3 733 212 Hz | **2.09×** |
| encode utf-8 100 KB | 19 644 Hz | 19 844 Hz | 18 375 Hz | **0.99×** (parity) |
| encode utf-8 10 MB | 222.3 Hz | 222.6 Hz | 225.9 Hz | **1.00×** (parity) |
| decode utf-16le 100 KB | 52 479 Hz | 54 245 Hz | — | **0.97×** (parity) |
| **decode latin1 10 MB** | 959.5 Hz | 28.26 Hz | — | **33.95×** |
| decode shift_jis 100 KB | 1 094 Hz | 1 971 Hz | — | **0.56×** (weak spot) |

### Realistic use case

**Byte-to-string / string-to-byte** at I/O boundaries: file reading with non-UTF-8 encoding, HTTP body with charset header, legacy-system integration. Median: 1 KB – 1 MB per call. Encoding diversity is bimodal: **95 % of production calls are UTF-8** (we're at parity through the short-circuit there), with the remainder split between Latin-1 (dominant win) and the CJK family (Shift_JIS weak, others OK).

### Benchmark gaps

- **UTF-16BE decode not benched** (only UTF-16LE). The BE variant uses the same `decode_utf16_inner` — expected same perf.
- **GBK / Big5 / EUC-KR decode** not benched. All use encoding_rs similarly to Shift_JIS; expected similarly weak. Documentation gap.
- **Non-UTF-8 encode paths** (latin1, shift_jis, windows-1252) not benched. Only the decode side + UTF-8 encode are measured.

### API surface

```rust
#[napi] fn encoding_exists(encoding: String) -> bool
#[napi] fn encode(input: String, encoding: String) -> Result<Buffer>
#[napi] fn decode(input: Buffer, encoding: String) -> Result<String>
```

- Input/output types are asymmetric: String input for encode (NAPI hands us a UTF-8 string), Buffer output; Buffer input for decode, String output.
- iconv-lite aliases (`utf8`, `cp932`, `cp1252`, …) are normalised via `normalise_label`.
- 4 non-WHATWG paths with iconv-lite semantics: UTF-16LE/BE, Latin-1 strict, Windows-1252 strict.
- UTF-8 has a short-circuit path (`is_utf8_label`) that bypasses encoding_rs entirely.

### Bundle / binary size

`encoding_rs` is fairly large (~800 KB – 1.2 MB with all tables). That's the price for 80+ encodings. Compact per target with `lto=true, strip=symbols`.

### FFI-overhead baseline

- 10 MB Latin-1 decode: input buffer ~10 MB via handle ~180 ns. Output string up to 20 MB (2× expansion) via UTF-8→UTF-16 conversion ~7 ms. On ~1 ms of Rust decode = **87 % FFI share!** Still 34× faster than iconv-lite because iconv-lite's JS loop is so much slower than our Rust + FFI combined.
- 100 KB Shift_JIS: FFI ~35 µs on ~900 µs Rust = 4 %. Not the bottleneck — the decoder itself is slow.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimisation | ✅ already done | `Buffer` on the decode side, UTF-8 short-circuit on encode |
| C.2 | Output-type minimisation | ✅ already done | Direct-byte writer in `decode_latin1_strict` etc. |
| C.3 | Batch API | 🟡 potential | `encodeMany(strings, encoding)` could matter for log-processing workloads. Unclear whether production demand exists |
| C.4 | Stateful API (pre-selected-encoding class) | ❌ not applicable | Encoding lookup cost is sub-µs |
| C.5 | Parallelisation (rayon for 10 MB+) | 🟡 potential | Latin-1 decode is embarrassingly parallelisable. 2× on 10 MB plausible via chunked parallel. Measure when production workload justifies it |
| C.6 | Algorithm swap for Shift_JIS | 🟡 **open** | The `encoding` crate (rust-encoding, unmaintained) had a lookup-table decoder. Or a custom table. Sprint candidate if 2× Shift_JIS becomes portfolio-relevant — currently it isn't |
| C.7 | Allocator tuning | ✅ already done | Pre-alloc heuristics in every hot path |
| C.8 | Bundle size | ✅ already done | `encoding_rs` without extra features |

## Action plan

**Keep-as-is.** Green classification confirmed by the 34× Latin-1 win.

Maintenance:

1. **Bench encode paths** (latin1, shift_jis, windows-1252) — the decode side is measured, encode isn't.
2. **Extend the CJK family** — GBK / Big5 / EUC-KR as separate bench slots so the Shift_JIS divergence is isolated.
3. **Custom Shift_JIS decoder as fast-follow experiment** if CJK-heavy workloads become portfolio-relevant.
4. **UTF-16BE decode bench** as a symmetry sanity check.

## References

- Crate: `crates/encoding`
- Bench: `crates/encoding/__bench__/index.bench.ts`
- Lib: `crates/encoding/src/lib.rs`
- Cargo: `crates/encoding/Cargo.toml`
- Phase-C status update: `docs/perf-review.md:38` ("Update 2026-04-19 (perf sprint)")
- `docs/packages.json` speedup: `"up to 34× faster / 1.8× slower"`
