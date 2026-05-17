//! Language detection — thin napi wrapper around `amigo-language-detect-core`.
//! See the core crate for the algorithm.

use amigo_language_detect_core as core;
use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct DetectOptions {
    /// Minimum input length in bytes before we even attempt detection.
    /// Below this the trigram signal is unreliable — we return `'und'`.
    pub min_length: Option<u32>,
    /// ISO-639-3 allow-list. Empty = consider every language whatlang knows.
    pub only: Option<Vec<String>>,
    /// ISO-639-3 deny-list. Applied after `only`.
    pub ignore: Option<Vec<String>>,
}

#[napi(object)]
pub struct LanguageMatch {
    pub lang: String,
    /// whatlang confidence in `[0, 1]`. Not directly comparable to franc's score.
    pub confidence: f64,
}

fn into_core(o: DetectOptions) -> core::DetectOptions {
    core::DetectOptions {
        min_length: o.min_length,
        only: o.only,
        ignore: o.ignore,
    }
}

/// Return the ISO-639-3 code of the most likely language, or `'und'` when the
/// input is shorter than `min_length` or no signal is detected.
#[napi]
pub fn detect(text: String, options: Option<DetectOptions>) -> String {
    let opts = options.map(into_core).unwrap_or_default();
    core::detect(&text, &opts)
}

/// Like `detect`, but returns `null` below `min_length` instead of `'und'`.
#[napi(js_name = "detectIfLong")]
pub fn detect_if_long(text: String, options: Option<DetectOptions>) -> Option<String> {
    let opts = options.map(into_core).unwrap_or_default();
    core::detect_if_long(&text, &opts)
}

/// Return a ranked list of top-N matches.
#[napi(js_name = "detectAll")]
pub fn detect_all(text: String, options: Option<DetectOptions>) -> Vec<LanguageMatch> {
    let opts = options.map(into_core).unwrap_or_default();
    core::detect_all(&text, &opts)
        .into_iter()
        .map(|m| LanguageMatch {
            lang: m.lang,
            confidence: m.confidence,
        })
        .collect()
}

/// Batch entry point — one FFI crossing amortises over N inputs.
#[napi(js_name = "detectMany")]
pub fn detect_many(texts: Vec<String>, options: Option<DetectOptions>) -> Vec<String> {
    let opts = options.map(into_core).unwrap_or_default();
    core::detect_many(texts, &opts)
}

/// True iff `whatlang` recognises the given ISO-639-3 code (lowercase).
#[napi(js_name = "languageExists")]
pub fn language_exists(code: String) -> bool {
    core::language_exists(&code)
}
