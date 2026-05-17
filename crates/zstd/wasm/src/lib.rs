//! WASM bindings for zstd. **Decompress-only** in the browser —
//! `compress` / `trainDictionary` throw "not available in the WASM
//! build" because the libzstd C backend doesn't compile for
//! `wasm32-unknown-unknown`. The decompressor uses `ruzstd` (pure-Rust).

use amigo_zstd_core as core;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn compress(_input: &[u8], _level: Option<i32>) -> Result<Vec<u8>, JsError> {
    Err(JsError::new(
        "zstd compress is not available in the WASM build (libzstd-only)",
    ))
}

#[wasm_bindgen]
pub fn decompress(input: &[u8]) -> Result<Vec<u8>, JsError> {
    core::decompress(input).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "trainDictionary")]
pub fn train_dictionary(_dict_size: Option<u32>) -> Result<Vec<u8>, JsError> {
    Err(JsError::new(
        "zstd train_dictionary is not available in the WASM build (libzstd-only)",
    ))
}
