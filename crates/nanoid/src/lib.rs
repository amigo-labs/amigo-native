use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn nanoid(size: Option<u32>) -> String {
    let n = size.unwrap_or(21) as usize;
    nanoid::nanoid!(n)
}

#[napi]
pub fn nanoid_custom(alphabet: String, size: Option<u32>) -> Result<String> {
    let n = size.unwrap_or(21) as usize;
    let chars: Vec<char> = alphabet.chars().collect();
    if chars.is_empty() {
        return Err(Error::from_reason("alphabet must not be empty"));
    }
    Ok(nanoid::nanoid!(n, &chars))
}

/// Batch API: generate `count` ids in a single FFI call. Each call to
/// `nanoid()` pays ~1.5µs N-API string-allocation overhead; for large
/// batches (>>100) this amortises the cost across the whole array.
#[napi(js_name = "nanoidBatch")]
pub fn nanoid_batch(count: u32, size: Option<u32>) -> Vec<String> {
    let n = size.unwrap_or(21) as usize;
    let c = count as usize;
    let mut out = Vec::with_capacity(c);
    for _ in 0..c {
        out.push(nanoid::nanoid!(n));
    }
    out
}

#[napi(js_name = "nanoidCustomBatch")]
pub fn nanoid_custom_batch(alphabet: String, count: u32, size: Option<u32>) -> Result<Vec<String>> {
    let n = size.unwrap_or(21) as usize;
    let c = count as usize;
    let chars: Vec<char> = alphabet.chars().collect();
    if chars.is_empty() {
        return Err(Error::from_reason("alphabet must not be empty"));
    }
    let mut out = Vec::with_capacity(c);
    for _ in 0..c {
        out.push(nanoid::nanoid!(n, &chars));
    }
    Ok(out)
}

// Rust unit tests intentionally omitted: exported #[napi] symbols cannot
// link into a pure-Rust test binary without the Node runtime. The vitest
// suite in __test__/index.spec.ts covers behaviour.
