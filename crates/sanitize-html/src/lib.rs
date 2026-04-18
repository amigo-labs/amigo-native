use napi::bindgen_prelude::Either;
use napi_derive::napi;
use std::collections::HashMap;

mod rules;
mod strict;
mod v2;

#[napi(object)]
pub struct SanitizeOptions {
    pub allowed_tags: Option<Vec<String>>,
    pub allowed_attributes: Option<HashMap<String, Vec<String>>>,
    pub allowed_classes: Option<HashMap<String, Vec<String>>>,
    pub allowed_schemes: Option<Vec<String>>,
    pub strip_comments: Option<bool>,
    pub link_rel: Option<String>,
    /// When `true`, every attribute not an event handler passes through.
    /// Set by `compat.mjs` when the caller uses `allowedAttributes: false`.
    pub allow_all_attributes: Option<bool>,
}

fn number_to_string(n: f64) -> String {
    // Match JS Number.prototype.toString(): integers print without decimals,
    // NaN/Infinity use their JS names.
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n < 0.0 {
            "-Infinity".into()
        } else {
            "Infinity".into()
        };
    }
    if n == n.trunc() && n.abs() < 1e21 {
        return format!("{}", n as i64);
    }
    format!("{n}")
}

pub(crate) fn coerce_input(html: Option<Either<String, f64>>) -> String {
    match html {
        None => String::new(),
        Some(Either::A(s)) => s,
        Some(Either::B(n)) => number_to_string(n),
    }
}

#[napi]
pub fn sanitize(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> String {
    v2::sanitize_impl(html, options)
}

/// Strict sanitize. Same rule surface as `sanitize`, but drives html5ever's
/// full TreeBuilder so SCRIPT_DATA / RAWTEXT / foreign-content state
/// transitions happen correctly. Routed to by `compat.mjs` when the caller
/// enables `<script>`/`<style>` or SVG/MathML tags, or opts out of case
/// normalisation via `parser.lowerCaseTags: false`.
#[napi(js_name = "sanitizeStrict")]
pub fn sanitize_strict(
    html: Option<Either<String, f64>>,
    options: Option<SanitizeOptions>,
) -> String {
    strict::sanitize_impl(html, options)
}

#[napi(js_name = "isClean")]
pub fn is_clean(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> bool {
    let coerced = coerce_input(html);
    sanitize(Some(Either::A(coerced.clone())), options) == coerced
}
