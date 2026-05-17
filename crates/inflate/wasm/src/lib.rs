use amigo_inflate_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InflateOptionsJs {
    level: Option<u32>,
    max_output_size: Option<u32>,
}

fn parse_opts(options: JsValue) -> Result<InflateOptionsJs, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(InflateOptionsJs::default());
    }
    serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn deflate(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::deflate(data, o.level).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn inflate(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::inflate(data, o.max_output_size).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "deflateRaw")]
pub fn deflate_raw(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::deflate_raw(data, o.level).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "inflateRaw")]
pub fn inflate_raw(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::inflate_raw(data, o.max_output_size).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn gzip(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::gzip(data, o.level).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn ungzip(data: &[u8], options: JsValue) -> Result<Vec<u8>, JsError> {
    let o = parse_opts(options)?;
    core::ungzip(data, o.max_output_size).map_err(|e| JsError::new(&e))
}
