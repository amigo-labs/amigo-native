//! WASM bindings for xxhash. The JS surface mirrors the napi crate's
//! shape — same function names, same option semantics — except that:
//!
//! - `Buffer` becomes `Uint8Array` (`&[u8]` in Rust).
//! - 64-bit hashes are returned as JS `BigInt` (wasm-bindgen native).
//! - The seed parameter accepts `u64`-as-BigInt directly (no signed
//!   wrap quirk — wasm-bindgen handles the conversion).

use amigo_xxhash_core as core;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn xxh32(input: &[u8], seed: Option<u32>) -> u32 {
    core::xxh32(input, seed.unwrap_or(0))
}

#[wasm_bindgen]
pub fn xxh64(input: &[u8], seed: Option<u64>) -> u64 {
    core::xxh64(input, seed.unwrap_or(0))
}

#[wasm_bindgen(js_name = "xxh3_64")]
pub fn xxh3_64(input: &[u8], seed: Option<u64>) -> u64 {
    core::xxh3_64(input, seed.unwrap_or(0))
}

#[wasm_bindgen(js_name = "xxh3_128")]
pub fn xxh3_128(input: &[u8], seed: Option<u64>) -> String {
    core::xxh3_128(input, seed.unwrap_or(0))
}

#[wasm_bindgen(js_name = "xxh32Many")]
pub fn xxh32_many(input: &[u8], chunk_size: u32, seed: Option<u32>) -> Result<Vec<u8>, JsError> {
    if chunk_size == 0 {
        return Err(JsError::new("chunk_size must be > 0"));
    }
    Ok(core::xxh32_many(
        input,
        chunk_size as usize,
        seed.unwrap_or(0),
    ))
}

#[wasm_bindgen(js_name = "xxh64Many")]
pub fn xxh64_many(input: &[u8], chunk_size: u32, seed: Option<u64>) -> Result<Vec<u8>, JsError> {
    if chunk_size == 0 {
        return Err(JsError::new("chunk_size must be > 0"));
    }
    Ok(core::xxh64_many(
        input,
        chunk_size as usize,
        seed.unwrap_or(0),
    ))
}

#[wasm_bindgen(js_name = "xxh3_64Many")]
pub fn xxh3_64_many(input: &[u8], chunk_size: u32, seed: Option<u64>) -> Result<Vec<u8>, JsError> {
    if chunk_size == 0 {
        return Err(JsError::new("chunk_size must be > 0"));
    }
    Ok(core::xxh3_64_many(
        input,
        chunk_size as usize,
        seed.unwrap_or(0),
    ))
}

#[wasm_bindgen]
pub struct Xxh32Hasher {
    inner: core::Xxh32,
}

#[wasm_bindgen]
impl Xxh32Hasher {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Option<u32>) -> Self {
        Self {
            inner: core::Xxh32::new(seed.unwrap_or(0)),
        }
    }

    #[wasm_bindgen]
    pub fn update(&mut self, chunk: &[u8]) {
        self.inner.update(chunk);
    }

    #[wasm_bindgen]
    pub fn digest(&self) -> u32 {
        self.inner.digest()
    }

    #[wasm_bindgen]
    pub fn reset(&mut self, seed: Option<u32>) {
        self.inner.reset(seed.unwrap_or(0));
    }
}

#[wasm_bindgen]
pub struct Xxh64Hasher {
    inner: core::Xxh64,
}

#[wasm_bindgen]
impl Xxh64Hasher {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Option<u64>) -> Self {
        Self {
            inner: core::Xxh64::new(seed.unwrap_or(0)),
        }
    }

    #[wasm_bindgen]
    pub fn update(&mut self, chunk: &[u8]) {
        self.inner.update(chunk);
    }

    #[wasm_bindgen]
    pub fn digest(&self) -> u64 {
        self.inner.digest()
    }

    #[wasm_bindgen(js_name = "digestHex")]
    pub fn digest_hex(&self) -> String {
        format!("{:016x}", self.inner.digest())
    }

    #[wasm_bindgen]
    pub fn reset(&mut self, seed: Option<u64>) {
        self.inner.reset(seed.unwrap_or(0));
    }
}

#[wasm_bindgen]
pub struct Xxh3Hasher {
    inner: core::Xxh3,
}

#[wasm_bindgen]
impl Xxh3Hasher {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Option<u64>) -> Self {
        Self {
            inner: core::Xxh3::with_seed(seed.unwrap_or(0)),
        }
    }

    #[wasm_bindgen]
    pub fn update(&mut self, chunk: &[u8]) {
        self.inner.update(chunk);
    }

    #[wasm_bindgen]
    pub fn digest(&self) -> u64 {
        self.inner.digest()
    }

    #[wasm_bindgen(js_name = "digestHex")]
    pub fn digest_hex(&self) -> String {
        format!("{:016x}", self.inner.digest())
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}
