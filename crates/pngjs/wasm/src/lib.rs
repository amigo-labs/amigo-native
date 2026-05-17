use amigo_pngjs_core as core;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DecodedPngJs {
    width: u32,
    height: u32,
    data: Vec<u8>,
    depth: u32,
    color_type: String,
}

#[wasm_bindgen(js_name = "decodeRgba")]
pub fn decode_rgba(input: &[u8]) -> Result<JsValue, JsError> {
    let d = core::decode_rgba(input).map_err(|e| JsError::new(&e))?;
    let js = DecodedPngJs {
        width: d.width,
        height: d.height,
        data: d.rgba,
        depth: 8,
        color_type: "rgba".to_string(),
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "encodeRgba")]
pub fn encode_rgba(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    core::encode_rgba(pixels, width, height).map_err(|e| JsError::new(&e))
}
