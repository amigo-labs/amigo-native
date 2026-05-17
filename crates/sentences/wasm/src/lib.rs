use amigo_sentences_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SplitOptionsJs {
    language: Option<String>,
    newline_boundaries: Option<bool>,
    preserve_whitespace: Option<bool>,
    custom_abbreviations: Option<Vec<String>>,
}

impl From<SplitOptionsJs> for core::SplitOptions {
    fn from(v: SplitOptionsJs) -> Self {
        Self {
            language: v.language,
            newline_boundaries: v.newline_boundaries,
            preserve_whitespace: v.preserve_whitespace,
            custom_abbreviations: v.custom_abbreviations,
        }
    }
}

fn resolve(options: JsValue) -> Result<core::Resolved, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::Resolved::from_opts(None));
    }
    let v: SplitOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    let opts: core::SplitOptions = v.into();
    Ok(core::Resolved::from_opts(Some(&opts)))
}

#[wasm_bindgen]
pub fn split(text: &str, options: JsValue) -> Result<Vec<String>, JsError> {
    Ok(core::split(text, &resolve(options)?))
}

#[wasm_bindgen(js_name = "splitToOffsets")]
pub fn split_to_offsets(text: &str, options: JsValue) -> Result<Vec<u8>, JsError> {
    Ok(core::split_to_offsets(text, &resolve(options)?))
}

#[wasm_bindgen(js_name = "splitBatch")]
pub fn split_batch(texts: Vec<String>, options: JsValue) -> Result<JsValue, JsError> {
    let cfg = resolve(options)?;
    let out: Vec<Vec<String>> = texts.iter().map(|t| core::split(t, &cfg)).collect();
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&e.to_string()))
}
