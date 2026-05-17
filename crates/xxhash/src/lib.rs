//! XXH32 / XXH64 / XXH3 — thin napi wrapper around `amigo-xxhash-core`.

use amigo_xxhash_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// Keep the pre-migration wrapping semantics of the old `i64 as u64` cast:
// a negative BigInt wraps to `u64::MAX - (-seed) + 1`, consistent with how
// xxhash implementations treat signed seed inputs. Values outside the i64
// range silently truncate.
fn seed_to_u64(seed: Option<BigInt>) -> u64 {
    match seed {
        Some(b) => b.get_i64().0 as u64,
        None => 0,
    }
}

#[napi]
pub fn xxh32(input: Buffer, seed: Option<u32>) -> u32 {
    core::xxh32(input.as_ref(), seed.unwrap_or(0))
}

#[napi]
pub fn xxh64(input: Buffer, seed: Option<BigInt>) -> BigInt {
    BigInt::from(core::xxh64(input.as_ref(), seed_to_u64(seed)))
}

#[napi(js_name = "xxh3_64")]
pub fn xxh3_64(input: Buffer, seed: Option<BigInt>) -> BigInt {
    BigInt::from(core::xxh3_64(input.as_ref(), seed_to_u64(seed)))
}

#[napi(js_name = "xxh3_128")]
pub fn xxh3_128(input: Buffer, seed: Option<BigInt>) -> String {
    core::xxh3_128(input.as_ref(), seed_to_u64(seed))
}

#[napi(js_name = "xxh32Many")]
pub fn xxh32_many(input: Buffer, chunk_size: u32, seed: Option<u32>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    Ok(core::xxh32_many(input.as_ref(), chunk_size as usize, seed.unwrap_or(0)).into())
}

#[napi(js_name = "xxh64Many")]
pub fn xxh64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    Ok(core::xxh64_many(input.as_ref(), chunk_size as usize, seed_to_u64(seed)).into())
}

#[napi(js_name = "xxh3_64Many")]
pub fn xxh3_64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Buffer> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    Ok(core::xxh3_64_many(input.as_ref(), chunk_size as usize, seed_to_u64(seed)).into())
}

#[napi]
pub struct Xxh32Hasher {
    inner: core::Xxh32,
}

#[napi]
impl Xxh32Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<u32>) -> Self {
        Self {
            inner: core::Xxh32::new(seed.unwrap_or(0)),
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
    inner: core::Xxh64,
}

#[napi]
impl Xxh64Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<BigInt>) -> Self {
        Self {
            inner: core::Xxh64::new(seed_to_u64(seed)),
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
    inner: core::Xxh3,
}

#[napi]
impl Xxh3Hasher {
    #[napi(constructor)]
    pub fn new(seed: Option<BigInt>) -> Self {
        Self {
            inner: core::Xxh3::with_seed(seed_to_u64(seed)),
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
