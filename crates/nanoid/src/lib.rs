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

// Rust unit tests intentionally omitted: exported #[napi] symbols cannot
// link into a pure-Rust test binary without the Node runtime. The vitest
// suite in __test__/index.spec.ts covers behaviour.
