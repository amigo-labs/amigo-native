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
    let hash =
        xxhash_rust::xxh3::xxh3_128_with_seed(input.as_ref(), seed.unwrap_or(0) as u64);
    format!("{:032x}", hash)
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
