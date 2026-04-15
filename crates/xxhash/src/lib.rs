use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn xxh32(input: Buffer, seed: Option<u32>) -> u32 {
    xxhash_rust::xxh32::xxh32(input.as_ref(), seed.unwrap_or(0))
}

#[napi]
pub fn xxh64(input: Buffer, seed: Option<i64>) -> i64 {
    xxhash_rust::xxh64::xxh64(input.as_ref(), seed.unwrap_or(0) as u64) as i64
}

#[napi(js_name = "xxh3_64")]
pub fn xxh3_64(input: Buffer, seed: Option<i64>) -> i64 {
    xxhash_rust::xxh3::xxh3_64_with_seed(input.as_ref(), seed.unwrap_or(0) as u64) as i64
}

#[napi(js_name = "xxh3_128")]
pub fn xxh3_128(input: Buffer, seed: Option<i64>) -> String {
    let hash = xxhash_rust::xxh3::xxh3_128_with_seed(input.as_ref(), seed.unwrap_or(0) as u64);
    format!("{:032x}", hash)
}

// --- Batch API: one FFI call for many inputs ---

#[napi(js_name = "xxh32Batch")]
pub fn xxh32_batch(inputs: Vec<Buffer>, seed: Option<u32>) -> Vec<u32> {
    let s = seed.unwrap_or(0);
    inputs
        .iter()
        .map(|buf| xxhash_rust::xxh32::xxh32(buf.as_ref(), s))
        .collect()
}

#[napi(js_name = "xxh64Batch")]
pub fn xxh64_batch(inputs: Vec<Buffer>, seed: Option<i64>) -> Vec<i64> {
    let s = seed.unwrap_or(0) as u64;
    inputs
        .iter()
        .map(|buf| xxhash_rust::xxh64::xxh64(buf.as_ref(), s) as i64)
        .collect()
}

#[napi(js_name = "xxh3_64Batch")]
pub fn xxh3_64_batch(inputs: Vec<Buffer>, seed: Option<i64>) -> Vec<i64> {
    let s = seed.unwrap_or(0) as u64;
    inputs
        .iter()
        .map(|buf| xxhash_rust::xxh3::xxh3_64_with_seed(buf.as_ref(), s) as i64)
        .collect()
}

#[napi]
pub struct Xxh3Hasher {
    inner: xxhash_rust::xxh3::Xxh3,
}

#[napi]
impl Xxh3Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<i64>) -> Self {
        Self {
            inner: xxhash_rust::xxh3::Xxh3::with_seed(seed.unwrap_or(0) as u64),
        }
    }

    #[napi]
    pub fn update(&mut self, chunk: Buffer) {
        self.inner.update(chunk.as_ref());
    }

    #[napi]
    pub fn digest(&self) -> i64 {
        self.inner.digest() as i64
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
