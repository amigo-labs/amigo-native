//! WASM bindings for text-splitters. The tiktoken-based length metric
//! is unavailable in this build — `lengthMetric: "tiktoken:*"` returns
//! an error. Pass `lengthMetric: "chars"` (the default) for the
//! browser path.

use amigo_text_splitters_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SplitterOptionsJs {
    chunk_size: Option<u32>,
    chunk_overlap: Option<u32>,
    length_metric: Option<String>,
}

fn parse_opts(options: JsValue) -> Result<core::SplitterOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::SplitterOptions::default());
    }
    let v: SplitterOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(core::SplitterOptions {
        chunk_size: v.chunk_size,
        chunk_overlap: v.chunk_overlap,
        length_metric: v.length_metric,
    })
}

#[wasm_bindgen(js_name = "splitText")]
pub fn split_text(text: &str, options: JsValue) -> Result<Vec<String>, JsError> {
    core::split_text(text, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "splitTextBatch")]
pub fn split_text_batch(texts: Vec<String>, options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let out: Vec<Vec<String>> = texts
        .iter()
        .map(|t| core::split_text(t, &opts))
        .collect::<Result<_, _>>()
        .map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "splitMarkdown")]
pub fn split_markdown(text: &str, options: JsValue) -> Result<Vec<String>, JsError> {
    core::split_markdown(text, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "splitMarkdownBatch")]
pub fn split_markdown_batch(texts: Vec<String>, options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let out: Vec<Vec<String>> = texts
        .iter()
        .map(|t| core::split_markdown(t, &opts))
        .collect::<Result<_, _>>()
        .map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "countChars")]
pub fn count_chars(text: &str) -> u32 {
    core::count_chars(text) as u32
}

/// In the WASM build this always returns an error — tiktoken-rs is not
/// available on wasm32. Use `countChars` for the browser path.
#[wasm_bindgen(js_name = "countTokens")]
pub fn count_tokens(text: &str, encoding: Option<String>) -> Result<u32, JsError> {
    core::count_tokens(text, encoding.as_deref())
        .map(|n| n as u32)
        .map_err(|e| JsError::new(&e))
}
