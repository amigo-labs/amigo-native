use amigo_encoding_core as core;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = "encodingExists")]
pub fn encoding_exists(encoding: &str) -> bool {
    core::label_exists(encoding)
}

#[wasm_bindgen]
pub fn encode(input: &str, encoding: &str) -> Result<Vec<u8>, JsError> {
    core::encode_str(input, encoding).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn decode(input: &[u8], encoding: &str) -> Result<String, JsError> {
    core::decode_bytes(input, encoding).map_err(|e| JsError::new(&e))
}
