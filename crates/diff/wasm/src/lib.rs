use amigo_diff_core as core;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct HunkJs {
    value: String,
    added: Option<bool>,
    removed: Option<bool>,
}

fn to_js(hs: Vec<core::Hunk>) -> Result<JsValue, JsError> {
    let js: Vec<HunkJs> = hs
        .into_iter()
        .map(|h| HunkJs {
            value: h.value,
            added: h.added,
            removed: h.removed,
        })
        .collect();
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "diffChars")]
pub fn diff_chars(old_str: &str, new_str: &str) -> Result<JsValue, JsError> {
    to_js(core::diff_chars(old_str, new_str))
}

#[wasm_bindgen(js_name = "diffWords")]
pub fn diff_words(old_str: &str, new_str: &str) -> Result<JsValue, JsError> {
    to_js(core::diff_words(old_str, new_str))
}

#[wasm_bindgen(js_name = "diffLines")]
pub fn diff_lines(old_str: &str, new_str: &str) -> Result<JsValue, JsError> {
    to_js(core::diff_lines(old_str, new_str))
}

#[wasm_bindgen(js_name = "diffTrimmedLines")]
pub fn diff_trimmed_lines(old_str: &str, new_str: &str) -> Result<JsValue, JsError> {
    to_js(core::diff_trimmed_lines(old_str, new_str))
}

#[wasm_bindgen(js_name = "diffLinesToOffsets")]
pub fn diff_lines_to_offsets(old_str: &str, new_str: &str) -> Result<Vec<u8>, JsError> {
    core::diff_lines_to_offsets(old_str, new_str).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "diffCharsToOffsets")]
pub fn diff_chars_to_offsets(old_str: &str, new_str: &str) -> Result<Vec<u8>, JsError> {
    core::diff_chars_to_offsets(old_str, new_str).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "createPatch")]
pub fn create_patch(
    file_name: &str,
    old_str: &str,
    new_str: &str,
    old_header: Option<String>,
    new_header: Option<String>,
) -> String {
    core::create_patch(
        file_name,
        old_str,
        new_str,
        old_header.as_deref(),
        new_header.as_deref(),
    )
}
