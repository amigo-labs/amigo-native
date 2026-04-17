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
pub fn xxh64_batch(inputs: Vec<Buffer>, seed: Option<BigInt>) -> Vec<BigInt> {
    let s = seed_to_u64(seed);
    inputs
        .iter()
        .map(|buf| BigInt::from(xxhash_rust::xxh64::xxh64(buf.as_ref(), s)))
        .collect()
}

#[napi(js_name = "xxh3_64Batch")]
pub fn xxh3_64_batch(inputs: Vec<Buffer>, seed: Option<BigInt>) -> Vec<BigInt> {
    let s = seed_to_u64(seed);
    inputs
        .iter()
        .map(|buf| BigInt::from(xxhash_rust::xxh3::xxh3_64_with_seed(buf.as_ref(), s)))
        .collect()
}

// --- Fixed-chunk bulk API: one Buffer in, Vec of u32/u64 out. Avoids the
// Vec<Buffer> marshalling cost that makes xxh32Batch/xxh64Batch slower than
// a serial loop when individual buffers are small.

#[napi(js_name = "xxh32Many")]
pub fn xxh32_many(input: Buffer, chunk_size: u32, seed: Option<u32>) -> Result<Vec<u32>> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed.unwrap_or(0);
    let cs = chunk_size as usize;
    Ok(input
        .as_ref()
        .chunks(cs)
        .map(|c| xxhash_rust::xxh32::xxh32(c, s))
        .collect())
}

#[napi(js_name = "xxh64Many")]
pub fn xxh64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Vec<BigInt>> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed_to_u64(seed);
    let cs = chunk_size as usize;
    Ok(input
        .as_ref()
        .chunks(cs)
        .map(|c| BigInt::from(xxhash_rust::xxh64::xxh64(c, s)))
        .collect())
}

#[napi(js_name = "xxh3_64Many")]
pub fn xxh3_64_many(input: Buffer, chunk_size: u32, seed: Option<BigInt>) -> Result<Vec<BigInt>> {
    if chunk_size == 0 {
        return Err(Error::from_reason("chunk_size must be > 0"));
    }
    let s = seed_to_u64(seed);
    let cs = chunk_size as usize;
    Ok(input
        .as_ref()
        .chunks(cs)
        .map(|c| BigInt::from(xxhash_rust::xxh3::xxh3_64_with_seed(c, s)))
        .collect())
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
