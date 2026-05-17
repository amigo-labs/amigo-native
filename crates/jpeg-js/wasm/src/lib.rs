use amigo_jpeg_js_core as core;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct DecodedJpegJs {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

#[wasm_bindgen]
pub fn decode(input: &[u8]) -> Result<JsValue, JsError> {
    let d = core::decode_rgba(input).map_err(|e| JsError::new(&e))?;
    let js = DecodedJpegJs {
        width: d.width,
        height: d.height,
        data: d.rgba,
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "decodeRgba")]
pub fn decode_rgba(input: &[u8]) -> Result<JsValue, JsError> {
    decode(input)
}

#[wasm_bindgen(js_name = "encodeRgba")]
pub fn encode_rgba(
    pixels: &[u8],
    width: u32,
    height: u32,
    quality: Option<u32>,
) -> Result<Vec<u8>, JsError> {
    let q = quality.map(|q| q.min(100) as u8).unwrap_or(75);
    core::encode_rgba(pixels, width, height, q).map_err(|e| JsError::new(&e))
}
