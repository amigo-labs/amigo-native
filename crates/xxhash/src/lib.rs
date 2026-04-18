use napi::bindgen_prelude::*;
use napi_derive::napi;

// Keep the pre-migration wrapping semantics of the old `i64 as u64` cast:
// a negative BigInt wraps to `u64::MAX - (-seed) + 1`, consistent with how
// xxhash implementations treat signed seed inputs. Values outside the i64
// range silently truncate — xxhash seeds are conceptually u64 but the NAPI
// JS surface can't pass a raw u64 without BigInt, so we accept i64-range.
fn seed_to_u64(seed: Option<BigInt>) -> u64 {
    match seed {
        Some(b) => b.get_i64().0 as u64,
        None => 0,
    }
}

#[napi]
pub fn xxh32(input: Buffer, seed: Option<u32>) -> u32 {
    xxhash_rust::xxh32::xxh32(input.as_ref(), seed.unwrap_or(0))
}

#[napi]
pub fn xxh64(input: Buffer, seed: Option<BigInt>) -> BigInt {
    BigInt::from(xxhash_rust::xxh64::xxh64(input.as_ref(), seed_to_u64(seed)))
}

#[napi(js_name = "xxh3_64")]
pub fn xxh3_64(input: Buffer, seed: Option<BigInt>) -> BigInt {
    BigInt::from(xxhash_rust::xxh3::xxh3_64_with_seed(
        input.as_ref(),
        seed_to_u64(seed),
    ))
}

#[napi(js_name = "xxh3_128")]
pub fn xxh3_128(input: Buffer, seed: Option<BigInt>) -> String {
    let hash = xxhash_rust::xxh3::xxh3_128_with_seed(input.as_ref(), seed_to_u64(seed));
    format!("{:032x}", hash)
}

// --- Fixed-chunk bulk API: one Buffer in, one Buffer out. Avoids both
// the `Vec<Buffer>` input cost (per-entry FFI crossing) and the
// `Vec<u32>` / `Vec<BigInt>` output cost (43 ns per element per
// `docs/BASELINE.md`). The returned Buffer is tightly packed
// little-endian hashes — u32 × N for xxh32, u64 × N for xxh64/xxh3_64.
// Readers can `buf.readUInt32LE(i * 4)` or use a `Uint32Array` view.
//
// Replaces the 0.1.x `xxh32Batch(Vec<Buffer>) -> Vec<u32>` family,
// which was slower than a hand-written loop of single-hash calls.

#[napi(js_name = "xxh32Many")]
pub fn xxh32_many(input: Buffer, chunk_size: u32, seed: Option<u32>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed.unwrap_or(0);
    let cs = chunk_size as usize;
    let bytes = input.as_ref();
    let n_chunks = bytes.len().div_ceil(cs);
    let mut out = Vec::with_capacity(n_chunks * 4);
    for c in bytes.chunks(cs) {
        out.extend_from_slice(&xxhash_rust::xxh32::xxh32(c, s).to_le_bytes());
    }
    Ok(out.into())
}

#[napi(js_name = "xxh64Many")]
pub fn xxh64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed_to_u64(seed);
    let cs = chunk_size as usize;
    let bytes = input.as_ref();
    let n_chunks = bytes.len().div_ceil(cs);
    let mut out = Vec::with_capacity(n_chunks * 8);
    for c in bytes.chunks(cs) {
        out.extend_from_slice(&xxhash_rust::xxh64::xxh64(c, s).to_le_bytes());
    }
    Ok(out.into())
}

#[napi(js_name = "xxh3_64Many")]
pub fn xxh3_64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed_to_u64(seed);
    let cs = chunk_size as usize;
    let bytes = input.as_ref();
    let n_chunks = bytes.len().div_ceil(cs);
    let mut out = Vec::with_capacity(n_chunks * 8);
    for c in bytes.chunks(cs) {
        out.extend_from_slice(&xxhash_rust::xxh3::xxh3_64_with_seed(c, s).to_le_bytes());
    }
    Ok(out.into())
}

#[napi]
pub struct Xxh32Hasher {
    inner: xxhash_rust::xxh32::Xxh32,
}

#[napi]
impl Xxh32Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<u32>) -> Self {
        Self {
            inner: xxhash_rust::xxh32::Xxh32::new(seed.unwrap_or(0)),
        }
    }

    #[napi]
    pub fn update(&mut self, chunk: Buffer) {
        self.inner.update(chunk.as_ref());
    }

    #[napi]
    pub fn digest(&self) -> u32 {
        self.inner.digest()
    }

    #[napi]
    pub fn reset(&mut self, seed: Option<u32>) {
        self.inner.reset(seed.unwrap_or(0));
    }
}

#[napi]
pub struct Xxh64Hasher {
    inner: xxhash_rust::xxh64::Xxh64,
}

#[napi]
impl Xxh64Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<BigInt>) -> Self {
        Self {
            inner: xxhash_rust::xxh64::Xxh64::new(seed_to_u64(seed)),
        }
    }

    #[napi]
    pub fn update(&mut self, chunk: Buffer) {
        self.inner.update(chunk.as_ref());
    }

    #[napi]
    pub fn digest(&self) -> BigInt {
        BigInt::from(self.inner.digest())
    }

    #[napi(js_name = "digestHex")]
    pub fn digest_hex(&self) -> String {
        format!("{:016x}", self.inner.digest())
    }

    #[napi]
    pub fn reset(&mut self, seed: Option<BigInt>) {
        self.inner.reset(seed_to_u64(seed));
    }
}

#[napi]
pub struct Xxh3Hasher {
    inner: xxhash_rust::xxh3::Xxh3,
}

#[napi]
impl Xxh3Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<BigInt>) -> Self {
        Self {
            inner: xxhash_rust::xxh3::Xxh3::with_seed(seed_to_u64(seed)),
        }
    }

    #[napi]
    pub fn update(&mut self, chunk: Buffer) {
        self.inner.update(chunk.as_ref());
    }

    #[napi]
    pub fn digest(&self) -> BigInt {
        BigInt::from(self.inner.digest())
    }

    #[napi(js_name = "digestHex")]
    pub fn digest_hex(&self) -> String {
        format!("{:016x}", self.inner.digest())
    }

    #[napi]
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}
