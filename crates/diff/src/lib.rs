//! Text diff — thin napi wrapper around `amigo-diff-core`.

use amigo_diff_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct Hunk {
    pub value: String,
    pub added: Option<bool>,
    pub removed: Option<bool>,
}

fn to_napi(hs: Vec<core::Hunk>) -> Vec<Hunk> {
    hs.into_iter()
        .map(|h| Hunk {
            value: h.value,
            added: h.added,
            removed: h.removed,
        })
        .collect()
}

#[napi(js_name = "diffChars")]
pub fn diff_chars(old_str: String, new_str: String) -> Vec<Hunk> {
    to_napi(core::diff_chars(&old_str, &new_str))
}

#[napi(js_name = "diffWords")]
pub fn diff_words(old_str: String, new_str: String) -> Vec<Hunk> {
    to_napi(core::diff_words(&old_str, &new_str))
}

#[napi(js_name = "diffLines")]
pub fn diff_lines(old_str: String, new_str: String) -> Vec<Hunk> {
    to_napi(core::diff_lines(&old_str, &new_str))
}

#[napi(js_name = "diffTrimmedLines")]
pub fn diff_trimmed_lines(old_str: String, new_str: String) -> Vec<Hunk> {
    to_napi(core::diff_trimmed_lines(&old_str, &new_str))
}

#[napi(js_name = "diffLinesToOffsets")]
pub fn diff_lines_to_offsets(old_str: String, new_str: String) -> Result<Buffer> {
    core::diff_lines_to_offsets(&old_str, &new_str)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi(js_name = "diffCharsToOffsets")]
pub fn diff_chars_to_offsets(old_str: String, new_str: String) -> Result<Buffer> {
    core::diff_chars_to_offsets(&old_str, &new_str)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi(js_name = "createPatch")]
pub fn create_patch(
    file_name: String,
    old_str: String,
    new_str: String,
    old_header: Option<String>,
    new_header: Option<String>,
) -> String {
    core::create_patch(
        &file_name,
        &old_str,
        &new_str,
        old_header.as_deref(),
        new_header.as_deref(),
    )
}
