//! Shared xxhash logic — internal crate used by the napi and WASM
//! bindings. The napi crate wraps these in `#[napi]`, the wasm crate
//! wraps them in `#[wasm_bindgen]`. SIMD is deferred per the
//! `expansion-2026.md` open question Q1.

pub use xxhash_rust::xxh3::Xxh3;
pub use xxhash_rust::xxh32::Xxh32;
pub use xxhash_rust::xxh64::Xxh64;

pub fn xxh32(input: &[u8], seed: u32) -> u32 {
    xxhash_rust::xxh32::xxh32(input, seed)
}

pub fn xxh64(input: &[u8], seed: u64) -> u64 {
    xxhash_rust::xxh64::xxh64(input, seed)
}

pub fn xxh3_64(input: &[u8], seed: u64) -> u64 {
    xxhash_rust::xxh3::xxh3_64_with_seed(input, seed)
}

pub fn xxh3_128(input: &[u8], seed: u64) -> String {
    format!(
        "{:032x}",
        xxhash_rust::xxh3::xxh3_128_with_seed(input, seed)
    )
}

/// Bulk hash over fixed-size chunks. Returns a `Vec<u8>` packed as
/// little-endian `u32 × N`. The caller must check `chunk_size > 0`.
pub fn xxh32_many(input: &[u8], chunk_size: usize, seed: u32) -> Vec<u8> {
    let n_chunks = input.len().div_ceil(chunk_size);
    let mut out = Vec::with_capacity(n_chunks * 4);
    for c in input.chunks(chunk_size) {
        out.extend_from_slice(&xxhash_rust::xxh32::xxh32(c, seed).to_le_bytes());
    }
    out
}

pub fn xxh64_many(input: &[u8], chunk_size: usize, seed: u64) -> Vec<u8> {
    let n_chunks = input.len().div_ceil(chunk_size);
    let mut out = Vec::with_capacity(n_chunks * 8);
    for c in input.chunks(chunk_size) {
        out.extend_from_slice(&xxhash_rust::xxh64::xxh64(c, seed).to_le_bytes());
    }
    out
}

pub fn xxh3_64_many(input: &[u8], chunk_size: usize, seed: u64) -> Vec<u8> {
    let n_chunks = input.len().div_ceil(chunk_size);
    let mut out = Vec::with_capacity(n_chunks * 8);
    for c in input.chunks(chunk_size) {
        out.extend_from_slice(&xxhash_rust::xxh3::xxh3_64_with_seed(c, seed).to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xxh32_seeded_and_unseeded_differ() {
        assert_ne!(xxh32(b"abc", 0), xxh32(b"abc", 1));
    }

    #[test]
    fn xxh3_128_hex_length() {
        assert_eq!(xxh3_128(b"hello", 0).len(), 32);
    }

    #[test]
    fn xxh32_many_packs_4_bytes_per_chunk() {
        let out = xxh32_many(b"abcdefgh", 4, 0);
        assert_eq!(out.len(), 8);
    }
}
