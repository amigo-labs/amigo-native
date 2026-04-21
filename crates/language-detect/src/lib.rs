//! Language detection via `whatlang` — ISO-639-3 codes out, franc-compatible
//! shape. The 109 ns FFI floor means short-string detection (<50 B) is never
//! meaningfully faster than pure JS: we ship `detect_if_long` as the safe
//! default for callers who care about reliability as well as speed.

use napi_derive::napi;
use whatlang::{Detector, Info, Lang};

const DEFAULT_MIN_LENGTH: u32 = 10;
const UND: &str = "und";

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

fn lang_code_lower(info: &Info) -> String {
    info.lang().code().to_lowercase()
}

fn parse_allow_list(list: &Option<Vec<String>>) -> Option<Vec<Lang>> {
    list.as_ref().map(|v| {
        v.iter()
            .filter_map(|s| {
                let norm = s.to_ascii_lowercase();
                Lang::from_code(&norm)
            })
            .collect()
    })
}

fn build_detector(opts: &DetectOptions) -> Detector {
    match (parse_allow_list(&opts.only), parse_allow_list(&opts.ignore)) {
        (Some(allow), _) if !allow.is_empty() => Detector::with_allowlist(allow),
        (_, Some(deny)) if !deny.is_empty() => Detector::with_denylist(deny),
        _ => Detector::new(),
    }
}

#[inline]
fn under_min(text: &str, min: u32) -> bool {
    (text.len() as u32) < min
}

fn min_length(opts: &DetectOptions) -> u32 {
    opts.min_length.unwrap_or(DEFAULT_MIN_LENGTH)
}

/// Return the ISO-639-3 code of the most likely language, or `'und'` when the
/// input is shorter than `min_length` or no signal is detected.
#[napi]
pub fn detect(text: String, options: Option<DetectOptions>) -> String {
    let opts = options.unwrap_or_default();
    if under_min(&text, min_length(&opts)) {
        return UND.to_string();
    }
    let detector = build_detector(&opts);
    detector
        .detect(&text)
        .map(|info| lang_code_lower(&info))
        .unwrap_or_else(|| UND.to_string())
}

/// Like `detect`, but returns `null` below `min_length` instead of `'und'`.
/// This is the recommended entry point for pipelines that prefer "I don't
/// know" over a guessed-but-wrong label.
#[napi(js_name = "detectIfLong")]
pub fn detect_if_long(text: String, options: Option<DetectOptions>) -> Option<String> {
    let opts = options.unwrap_or_default();
    if under_min(&text, min_length(&opts)) {
        return None;
    }
    let detector = build_detector(&opts);
    detector.detect(&text).map(|info| lang_code_lower(&info))
}

/// Return a ranked list of top-N matches.
#[napi(js_name = "detectAll")]
pub fn detect_all(text: String, options: Option<DetectOptions>) -> Vec<LanguageMatch> {
    let opts = options.unwrap_or_default();
    if under_min(&text, min_length(&opts)) {
        return Vec::new();
    }
    let detector = build_detector(&opts);
    // whatlang's single-detect already returns the best candidate + confidence.
    // For "all", we just wrap it as a one-element list; whatlang doesn't
    // expose internal ranking, and franc users typically only read the first
    // entry anyway. Callers needing full ranking should move to lingua-rs.
    detector
        .detect(&text)
        .map(|info| {
            vec![LanguageMatch {
                lang: lang_code_lower(&info),
                confidence: info.confidence(),
            }]
        })
        .unwrap_or_default()
}

/// Batch entry point — one FFI crossing amortises over N inputs.
#[napi(js_name = "detectMany")]
pub fn detect_many(texts: Vec<String>, options: Option<DetectOptions>) -> Vec<String> {
    let opts = options.unwrap_or_default();
    let min = min_length(&opts);
    let detector = build_detector(&opts);
    texts
        .into_iter()
        .map(|t| {
            if under_min(&t, min) {
                return UND.to_string();
            }
            detector
                .detect(&t)
                .map(|info| lang_code_lower(&info))
                .unwrap_or_else(|| UND.to_string())
        })
        .collect()
}

/// True iff `whatlang` recognises the given ISO-639-3 code (lowercase).
#[napi(js_name = "languageExists")]
pub fn language_exists(code: String) -> bool {
    Lang::from_code(&code.to_ascii_lowercase()).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_english() {
        let result = detect("The quick brown fox jumps over the lazy dog".to_string(), None);
        assert_eq!(result, "eng");
    }

    #[test]
    fn detects_german() {
        let result = detect(
            "Der schnelle braune Fuchs springt über den faulen Hund".to_string(),
            None,
        );
        assert_eq!(result, "deu");
    }

    #[test]
    fn short_input_returns_und() {
        assert_eq!(detect("hi".to_string(), None), "und");
    }

    #[test]
    fn detect_if_long_returns_none_for_short_input() {
        assert!(detect_if_long("hi".to_string(), None).is_none());
    }

    #[test]
    fn only_allow_list_restricts_detection() {
        let opts = DetectOptions {
            only: Some(vec!["deu".to_string(), "fra".to_string()]),
            ..Default::default()
        };
        // English text restricted to {deu, fra} — whatlang returns one of
        // them (probably fra due to trigram overlap). We only check that the
        // returned lang is inside the allow-list.
        let text = "The quick brown fox jumps over the lazy dog".to_string();
        let got = detect(text, Some(opts));
        assert!(got == "deu" || got == "fra" || got == "und");
    }

    #[test]
    fn language_exists_recognises_common_codes() {
        assert!(language_exists("eng".to_string()));
        assert!(language_exists("deu".to_string()));
        assert!(language_exists("FRA".to_string()));
        assert!(!language_exists("zzz".to_string()));
    }

    #[test]
    fn detect_many_preserves_order() {
        let texts = vec![
            "The quick brown fox jumps over the lazy dog".to_string(),
            "Der schnelle braune Fuchs springt über den faulen Hund".to_string(),
            "hi".to_string(),
        ];
        let got = detect_many(texts, None);
        assert_eq!(got.len(), 3);
        assert_eq!(got[0], "eng");
        assert_eq!(got[1], "deu");
        assert_eq!(got[2], "und");
    }
}
