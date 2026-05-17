//! Shared HTML sanitization core — internal-only. The napi and WASM
//! bindings wrap `sanitize` / `sanitize_strict` after coercing their
//! FFI-specific input shapes (napi `Either<String, f64>`, JS string)
//! into a plain `&str`.

use std::collections::HashMap;

mod rules;
mod strict;
mod v2;

#[derive(Default, Debug, Clone)]
pub struct SanitizeOptions {
    pub allowed_tags: Option<Vec<String>>,
    pub allowed_attributes: Option<HashMap<String, Vec<String>>>,
    pub allowed_classes: Option<HashMap<String, Vec<String>>>,
    pub allowed_schemes: Option<Vec<String>>,
    pub strip_comments: Option<bool>,
    pub link_rel: Option<String>,
    pub allow_all_attributes: Option<bool>,
    pub max_depth: Option<u32>,
    pub max_input_bytes: Option<u32>,
}

pub fn sanitize(html: &str, options: &SanitizeOptions) -> String {
    v2::sanitize_impl(html, options)
}

pub fn sanitize_strict(html: &str, options: &SanitizeOptions) -> String {
    strict::sanitize_impl(html, options)
}

pub fn is_clean(html: &str, options: &SanitizeOptions) -> bool {
    sanitize(html, options) == html
}
