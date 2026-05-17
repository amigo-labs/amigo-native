//! WASM bindings for sanitize-html. The napi `Either<String, f64>` shape
//! is dropped — browser callers always pass a string (or undefined/null).
//! `SanitizeOptions` flows via serde-wasm-bindgen.

use amigo_sanitize_html_core as core;
use serde::Deserialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SanitizeOptionsJs {
    allowed_tags: Option<Vec<String>>,
    allowed_attributes: Option<HashMap<String, Vec<String>>>,
    allowed_classes: Option<HashMap<String, Vec<String>>>,
    allowed_schemes: Option<Vec<String>>,
    strip_comments: Option<bool>,
    link_rel: Option<String>,
    allow_all_attributes: Option<bool>,
    max_depth: Option<u32>,
    max_input_bytes: Option<u32>,
}

impl From<SanitizeOptionsJs> for core::SanitizeOptions {
    fn from(v: SanitizeOptionsJs) -> Self {
        Self {
            allowed_tags: v.allowed_tags,
            allowed_attributes: v.allowed_attributes,
            allowed_classes: v.allowed_classes,
            allowed_schemes: v.allowed_schemes,
            strip_comments: v.strip_comments,
            link_rel: v.link_rel,
            allow_all_attributes: v.allow_all_attributes,
            max_depth: v.max_depth,
            max_input_bytes: v.max_input_bytes,
        }
    }
}

fn parse_opts(options: JsValue) -> Result<core::SanitizeOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::SanitizeOptions::default());
    }
    let v: SanitizeOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen]
pub fn sanitize(html: Option<String>, options: JsValue) -> Result<String, JsError> {
    Ok(core::sanitize(
        html.as_deref().unwrap_or(""),
        &parse_opts(options)?,
    ))
}

#[wasm_bindgen(js_name = "sanitizeStrict")]
pub fn sanitize_strict(html: Option<String>, options: JsValue) -> Result<String, JsError> {
    Ok(core::sanitize_strict(
        html.as_deref().unwrap_or(""),
        &parse_opts(options)?,
    ))
}

#[wasm_bindgen(js_name = "isClean")]
pub fn is_clean(html: Option<String>, options: JsValue) -> Result<bool, JsError> {
    Ok(core::is_clean(
        html.as_deref().unwrap_or(""),
        &parse_opts(options)?,
    ))
}
