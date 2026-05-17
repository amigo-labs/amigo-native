//! Sentence Boundary Detection (SBD) — thin napi wrapper around
//! `amigo-sentences-core`. See the core crate for the rule engine.

use amigo_sentences_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone)]
pub struct SplitOptions {
    /// Language code. Default: "en". Supported: en, de, fr, es, it, pt, nl.
    pub language: Option<String>,
    /// Treat `\n\n` as a hard sentence boundary. Default: false.
    pub newline_boundaries: Option<bool>,
    /// Keep leading/trailing whitespace on each emitted sentence.
    /// Default: false — sentences are trimmed.
    pub preserve_whitespace: Option<bool>,
    /// Additional abbreviations to recognise (without trailing period).
    pub custom_abbreviations: Option<Vec<String>>,
}

fn resolve(o: Option<SplitOptions>) -> core::Resolved {
    let opts = o.map(|x| core::SplitOptions {
        language: x.language,
        newline_boundaries: x.newline_boundaries,
        preserve_whitespace: x.preserve_whitespace,
        custom_abbreviations: x.custom_abbreviations,
    });
    core::Resolved::from_opts(opts.as_ref())
}

#[napi(js_name = "split")]
pub fn split(text: String, options: Option<SplitOptions>) -> Vec<String> {
    let cfg = resolve(options);
    core::split(&text, &cfg)
}

/// Zero-copy hot-path. Returns a `Buffer` laid out as u32 little-endian
/// pairs: `[start0, end0, start1, end1, …]`.
#[napi(js_name = "splitToOffsets")]
pub fn split_to_offsets(text: String, options: Option<SplitOptions>) -> Buffer {
    let cfg = resolve(options);
    core::split_to_offsets(&text, &cfg).into()
}

#[napi(js_name = "splitBatch")]
pub fn split_batch(texts: Vec<String>, options: Option<SplitOptions>) -> Vec<Vec<String>> {
    let cfg = resolve(options);
    texts.into_iter().map(|t| core::split(&t, &cfg)).collect()
}

#[napi(js_name = "splitBatchToOffsets")]
pub fn split_batch_to_offsets(texts: Vec<String>, options: Option<SplitOptions>) -> Vec<Buffer> {
    let cfg = resolve(options);
    texts
        .into_iter()
        .map(|t| core::split_to_offsets(&t, &cfg).into())
        .collect()
}
