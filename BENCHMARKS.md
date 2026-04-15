# Benchmarks

> Node.js v22.22.2, Linux x64
> Run with `pnpm bench`

## Performance

### slugify

| Scenario | @amigo-labs/slugify | slugify (npm) | Speedup |
|:---|---:|---:|:---|
| short ASCII (20 chars) | 1,304,735 ops/s | 455,326 ops/s | **2.9x faster** |
| long ASCII (500 chars) | 121,749 ops/s | 20,776 ops/s | **5.9x faster** |
| unicode heavy | 292,888 ops/s | 90,411 ops/s | **3.2x faster** |

### argon2

| Scenario | @amigo-labs/argon2 | argon2 (npm, C) | hash-wasm (WASM) | vs C | vs WASM |
|:---|---:|---:|---:|:---|:---|
| hash (low-cost) | 257 ops/s | 188 ops/s | 115 ops/s | **1.4x faster** | **2.2x faster** |
| verify | 269 ops/s | — | — | — | — |

### xxhash

| Scenario | @amigo-labs/xxhash | xxhash-wasm | xxhashjs | vs wasm | vs pure JS |
|:---|---:|---:|---:|:---|:---|
| xxh32 64B | 4,087,953 ops/s | 7,471,486 ops/s | 1,046,868 ops/s | 1.8x slower | **3.9x faster** |
| xxh32 1KB | 2,399,550 ops/s | 2,971,002 ops/s | 246,627 ops/s | 1.2x slower | **9.7x faster** |
| xxh32 1MB | 5,340 ops/s | 4,488 ops/s | 271 ops/s | **1.2x faster** | **19.7x faster** |
| xxh64 64B | 3,914,400 ops/s | 6,902,263 ops/s | 15,621 ops/s | 1.8x slower | **250x faster** |
| xxh64 1KB | 3,081,953 ops/s | 4,271,301 ops/s | 9,180 ops/s | 1.4x slower | **336x faster** |
| xxh64 1MB | 10,594 ops/s | 7,687 ops/s | 21 ops/s | **1.4x faster** | **494x faster** |
| xxh3 1MB | 18,609 ops/s | 7,641 ops/s (h64) | — | **2.4x faster** | — |

> xxhash-wasm is faster for small inputs (WASM has lower call overhead than napi-rs FFI). napi-rs wins at >= 1MB where Rust SIMD dominates. xxh3 is consistently fastest.

### sanitize-html

| Scenario | @amigo-labs | sanitize-html (npm) | isomorphic-dompurify | vs npm | vs dompurify |
|:---|---:|---:|---:|:---|:---|
| small (~200 chars) | 52,721 ops/s | 27,061 ops/s | 907 ops/s | **1.9x faster** | **58x faster** |
| medium XSS (~2 KB) | 6,018 ops/s | 3,619 ops/s | 175 ops/s | **1.7x faster** | **34x faster** |
| large (~100 KB) | 150 ops/s | 86 ops/s | 8 ops/s | **1.8x faster** | **18x faster** |

### csv

| Scenario | @amigo-labs/csv | csv-parse (sync) | papaparse | vs csv-parse | vs papaparse |
|:---|---:|---:|---:|:---|:---|
| 100 rows | 7,532 ops/s | 3,812 ops/s | 7,434 ops/s | **2.0x faster** | ~equal |
| 10K rows | 70 ops/s | 40 ops/s | 97 ops/s | **1.7x faster** | 1.4x slower |
| 100K rows | 3.4 ops/s | 1.8 ops/s | 4.8 ops/s | **1.9x faster** | 1.4x slower |

> papaparse is faster at scale because napi-rs FFI boundary (Rust `Vec<Vec<String>>` -> JS `Array`) has per-cell overhead. Raw Rust parsing is faster, but data transfer dominates. Still consistently 2x faster than csv-parse.

## Install Size

Single-platform install footprint (`node_modules`).

| Package | @amigo-labs | Competitor | Competitor Size | Difference |
|:---|---:|:---|---:|:---|
| slugify | 967 KB | slugify (npm) | 16 KB | competitor 59x smaller |
| argon2 | 466 KB | argon2 (npm, C) | 1.5 MB | **amigo 3.3x smaller** |
| argon2 | 466 KB | hash-wasm | 1.7 MB | **amigo 3.8x smaller** |
| xxhash | 393 KB | xxhash-wasm | 136 KB | competitor 2.9x smaller |
| xxhash | 393 KB | xxhashjs | 301 KB | competitor 1.3x smaller |
| sanitize-html | 1.6 MB | sanitize-html (npm) | 1.9 MB | **amigo 1.2x smaller** |
| sanitize-html | 1.6 MB | isomorphic-dompurify | 21.2 MB | **amigo 13.6x smaller** |
| csv | 458 KB | csv-parse | 1.4 MB | **amigo 3.1x smaller** |
| csv | 458 KB | papaparse | 258 KB | competitor 1.8x smaller |

## Summary

| Package | Performance | Size |
|:---|:---|:---|
| **slugify** | **2.9-5.9x faster** | 59x larger (native binary vs 16 KB JS) |
| **argon2** | **1.4x faster than C, 2.2x faster than WASM** | **3.3-3.8x smaller** (no node-gyp) |
| **xxhash** | **1.2-2.4x faster at >=1MB**, slower at small inputs | 1.3-2.9x larger than WASM/JS |
| **sanitize-html** | **1.7-1.9x faster, 18-58x faster than DOMPurify** | **1.2-13.6x smaller** |
| **csv** | **1.7-2.0x faster than csv-parse**, ~equal to papaparse | **3.1x smaller** than csv-parse |
