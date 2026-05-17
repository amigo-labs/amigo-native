//! HTML sanitization — thin napi wrapper around
//! `amigo-sanitize-html-core`. Translates the napi `Either<String, f64>`
//! input shape into a plain `&str` and the napi `SanitizeOptions` into
//! the core's plain struct.

use amigo_sanitize_html_core as core;
use napi::bindgen_prelude::Either;
use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
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

fn number_to_string(n: f64) -> String {
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

fn coerce_input(html: Option<Either<String, f64>>) -> String {
    match html {
        None => String::new(),
        Some(Either::A(s)) => s,
        Some(Either::B(n)) => number_to_string(n),
    }
}

fn into_core(options: Option<SanitizeOptions>) -> core::SanitizeOptions {
    let o = options.unwrap_or(SanitizeOptions {
        allowed_tags: None,
        allowed_attributes: None,
        allowed_classes: None,
        allowed_schemes: None,
        strip_comments: None,
        link_rel: None,
        allow_all_attributes: None,
        max_depth: None,
        max_input_bytes: None,
    });
    core::SanitizeOptions {
        allowed_tags: o.allowed_tags,
        allowed_attributes: o.allowed_attributes,
        allowed_classes: o.allowed_classes,
        allowed_schemes: o.allowed_schemes,
        strip_comments: o.strip_comments,
        link_rel: o.link_rel,
        allow_all_attributes: o.allow_all_attributes,
        max_depth: o.max_depth,
        max_input_bytes: o.max_input_bytes,
    }
}

#[napi]
pub fn sanitize(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> String {
    let s = coerce_input(html);
    core::sanitize(&s, &into_core(options))
}

#[napi(js_name = "sanitizeStrict")]
pub fn sanitize_strict(
    html: Option<Either<String, f64>>,
    options: Option<SanitizeOptions>,
) -> String {
    let s = coerce_input(html);
    core::sanitize_strict(&s, &into_core(options))
}

#[napi(js_name = "isClean")]
pub fn is_clean(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> bool {
    let s = coerce_input(html);
    core::is_clean(&s, &into_core(options))
}
