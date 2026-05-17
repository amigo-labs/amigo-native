//! WASM bindings for pdf-parse. The napi async variant is dropped
//! (no thread pool in WASM) — only `parseSync` ships.

use amigo_pdf_parse_core as core;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PdfParseOptionsJs {
    max: Option<u32>,
    password: Option<String>,
}

#[derive(Serialize)]
struct PdfParseResultJs {
    text: String,
    numpages: u32,
    info: HashMap<String, String>,
    metadata: Option<String>,
    version: String,
}

fn parse_opts(options: JsValue) -> Result<core::PdfParseOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::PdfParseOptions::default());
    }
    let v: PdfParseOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(core::PdfParseOptions {
        max: v.max,
        password: v.password,
    })
}

#[wasm_bindgen(js_name = "parseSync")]
pub fn parse_sync(buf: &[u8], options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let r = core::parse(buf, &opts).map_err(|e| JsError::new(&e))?;
    let js = PdfParseResultJs {
        text: r.text,
        numpages: r.numpages,
        info: r.info,
        metadata: r.metadata,
        version: r.version,
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}
