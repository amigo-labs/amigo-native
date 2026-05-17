//! Shared language-detection logic used by @amigo-labs/language-detect
//! (napi and WASM bindings). Internal-only crate (not published to npm).
//!
//! Returns ISO-639-3 codes. Short inputs (below `min_length`) return the
//! sentinel `"und"` rather than guessing — trigram detection is unreliable
//! on fewer than ~10 bytes.

use whatlang::{Detector, Info, Lang};

pub const DEFAULT_MIN_LENGTH: u32 = 10;
pub const UND: &str = "und";

#[derive(Default, Debug, Clone)]
pub struct DetectOptions {
    pub min_length: Option<u32>,
    pub only: Option<Vec<String>>,
    pub ignore: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct LanguageMatch {
    pub lang: String,
    pub confidence: f64,
}

fn lang_code_lower(info: &Info) -> String {
    info.lang().code().to_lowercase()
}

fn parse_allow_list(list: &Option<Vec<String>>) -> Option<Vec<Lang>> {
    list.as_ref().map(|v| {
        v.iter()
            .filter_map(|s| Lang::from_code(s.to_ascii_lowercase()))
            .collect()
    })
}

pub fn build_detector(opts: &DetectOptions) -> Detector {
    match (parse_allow_list(&opts.only), parse_allow_list(&opts.ignore)) {
        (Some(allow), _) if !allow.is_empty() => Detector::with_allowlist(allow),
        (_, Some(deny)) if !deny.is_empty() => Detector::with_denylist(deny),
        _ => Detector::new(),
    }
}

#[inline]
pub fn under_min(text: &str, min: u32) -> bool {
    (text.len() as u32) < min
}

pub fn min_length(opts: &DetectOptions) -> u32 {
    opts.min_length.unwrap_or(DEFAULT_MIN_LENGTH)
}

pub fn detect(text: &str, opts: &DetectOptions) -> String {
    if under_min(text, min_length(opts)) {
        return UND.to_string();
    }
    let detector = build_detector(opts);
    detector
        .detect(text)
        .map(|info| lang_code_lower(&info))
        .unwrap_or_else(|| UND.to_string())
}

pub fn detect_if_long(text: &str, opts: &DetectOptions) -> Option<String> {
    if under_min(text, min_length(opts)) {
        return None;
    }
    let detector = build_detector(opts);
    detector.detect(text).map(|info| lang_code_lower(&info))
}

pub fn detect_all(text: &str, opts: &DetectOptions) -> Vec<LanguageMatch> {
    if under_min(text, min_length(opts)) {
        return Vec::new();
    }
    let detector = build_detector(opts);
    detector
        .detect(text)
        .map(|info| {
            vec![LanguageMatch {
                lang: lang_code_lower(&info),
                confidence: info.confidence(),
            }]
        })
        .unwrap_or_default()
}

pub fn detect_many(texts: Vec<String>, opts: &DetectOptions) -> Vec<String> {
    let min = min_length(opts);
    let detector = build_detector(opts);
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

pub fn language_exists(code: &str) -> bool {
    Lang::from_code(code.to_ascii_lowercase()).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_english() {
        assert_eq!(
            detect(
                "The quick brown fox jumps over the lazy dog",
                &DetectOptions::default()
            ),
            "eng"
        );
    }

    #[test]
    fn detects_german() {
        assert_eq!(
            detect(
                "Der schnelle braune Fuchs springt über den faulen Hund",
                &DetectOptions::default()
            ),
            "deu"
        );
    }

    #[test]
    fn short_input_returns_und() {
        assert_eq!(detect("hi", &DetectOptions::default()), "und");
    }

    #[test]
    fn language_exists_recognises_common_codes() {
        assert!(language_exists("eng"));
        assert!(language_exists("deu"));
        assert!(language_exists("FRA"));
        assert!(!language_exists("zzz"));
    }
}
