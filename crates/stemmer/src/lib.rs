//! Batch-only Porter/Snowball stemmer. Single-word stemming is intentionally
//! not exposed: it costs ~30 ns of JS work per call, which is smaller than
//! the 109 ns NAPI floor — the exact shape that retired our levenshtein crate.
//! Callers who think they want per-word stemming should use `tokenizeAndStem`
//! instead (tokenize + stem inside one FFI crossing).

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rust_stemmers::{Algorithm, Stemmer as InnerStemmer};
use std::borrow::Cow;
use unicode_segmentation::UnicodeSegmentation;

fn resolve_algorithm(lang: &str) -> Result<Algorithm> {
    match lang.to_ascii_lowercase().as_str() {
        "arabic" => Ok(Algorithm::Arabic),
        "danish" => Ok(Algorithm::Danish),
        "dutch" => Ok(Algorithm::Dutch),
        "english" => Ok(Algorithm::English),
        "finnish" => Ok(Algorithm::Finnish),
        "french" => Ok(Algorithm::French),
        "german" => Ok(Algorithm::German),
        "greek" => Ok(Algorithm::Greek),
        "hungarian" => Ok(Algorithm::Hungarian),
        "italian" => Ok(Algorithm::Italian),
        "norwegian" => Ok(Algorithm::Norwegian),
        "portuguese" => Ok(Algorithm::Portuguese),
        "romanian" => Ok(Algorithm::Romanian),
        "russian" => Ok(Algorithm::Russian),
        "spanish" => Ok(Algorithm::Spanish),
        "swedish" => Ok(Algorithm::Swedish),
        "tamil" => Ok(Algorithm::Tamil),
        "turkish" => Ok(Algorithm::Turkish),
        other => Err(Error::from_reason(format!(
            "unknown stemmer language: {other}"
        ))),
    }
}

#[napi(object)]
#[derive(Default)]
pub struct TokenizeOptions {
    /// Lowercase tokens before stemming. Default true.
    pub lowercase: Option<bool>,
    /// Minimum token length (shorter tokens are dropped). Default 2.
    pub min_token_length: Option<u32>,
    /// Drop tokens that appear in the embedded English stopword list.
    /// Default false. (No other language lists are bundled in v0.1.)
    pub stopwords_en: Option<bool>,
}

// Small English stopword list — the MySQL/InnoDB default corpus. Covers
// the 80 % that search/index users typically want dropped without pulling
// in a larger corpus dependency.
const EN_STOPWORDS: &[&str] = &[
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "com", "de", "en", "for", "from",
    "how", "i", "in", "is", "it", "la", "of", "on", "or", "that", "the", "this", "to", "was",
    "what", "when", "where", "who", "will", "with", "und", "www",
];

#[inline]
fn is_en_stopword(tok: &str) -> bool {
    EN_STOPWORDS.contains(&tok)
}

fn stem_one<'a>(stemmer: &InnerStemmer, word: &'a str) -> Cow<'a, str> {
    stemmer.stem(word)
}

#[napi]
pub struct Stemmer {
    inner: InnerStemmer,
    language: String,
}

#[napi]
impl Stemmer {
    #[napi(constructor)]
    pub fn new(language: String) -> Result<Self> {
        let alg = resolve_algorithm(&language)?;
        Ok(Self {
            inner: InnerStemmer::create(alg),
            language,
        })
    }

    /// Batch-stem a list of whole words. Runs per-word internally without
    /// FFI crossings; the whole array is one crossing each way.
    #[napi]
    pub fn stem_many(&self, words: Vec<String>) -> Vec<String> {
        words
            .into_iter()
            .map(|w| stem_one(&self.inner, &w).into_owned())
            .collect()
    }

    /// Stem a newline-delimited buffer and return a newline-delimited buffer.
    /// Zero-copy on the input side; output is packed to avoid per-word
    /// JS-string marshalling.
    #[napi]
    pub fn stem_buffer(&self, buffer: Buffer) -> Result<Buffer> {
        let input =
            std::str::from_utf8(buffer.as_ref()).map_err(|e| Error::from_reason(e.to_string()))?;
        let mut out = String::with_capacity(input.len());
        let mut first = true;
        for line in input.split('\n') {
            if !first {
                out.push('\n');
            }
            first = false;
            let stemmed = stem_one(&self.inner, line);
            out.push_str(&stemmed);
        }
        Ok(out.into_bytes().into())
    }

    /// Tokenize text (unicode-word-aware) and stem every token in one FFI
    /// crossing. This is the realistic hot-path — callers rarely have a
    /// pre-tokenised word list; they have documents.
    #[napi]
    pub fn tokenize_and_stem(&self, text: String, options: Option<TokenizeOptions>) -> Vec<String> {
        let opts = options.unwrap_or_default();
        let lowercase = opts.lowercase.unwrap_or(true);
        let min_len = opts.min_token_length.unwrap_or(2) as usize;
        let stopwords_en = opts.stopwords_en.unwrap_or(false) && self.language == "english";

        text.unicode_words()
            .filter_map(|w| {
                let word: Cow<str> = if lowercase {
                    Cow::Owned(w.to_lowercase())
                } else {
                    Cow::Borrowed(w)
                };
                if word.len() < min_len {
                    return None;
                }
                if stopwords_en && is_en_stopword(&word) {
                    return None;
                }
                Some(stem_one(&self.inner, &word).into_owned())
            })
            .collect()
    }

    /// Tokenize-and-stem variant that returns a newline-delimited Buffer
    /// instead of a `string[]`. Use this when the next stage is another
    /// Rust component (bm25 index build, for example).
    #[napi]
    pub fn tokenize_and_stem_to_buffer(
        &self,
        text: String,
        options: Option<TokenizeOptions>,
    ) -> Buffer {
        let opts = options.unwrap_or_default();
        let lowercase = opts.lowercase.unwrap_or(true);
        let min_len = opts.min_token_length.unwrap_or(2) as usize;
        let stopwords_en = opts.stopwords_en.unwrap_or(false) && self.language == "english";

        let mut out = String::with_capacity(text.len());
        let mut first = true;
        for w in text.unicode_words() {
            let word: Cow<str> = if lowercase {
                Cow::Owned(w.to_lowercase())
            } else {
                Cow::Borrowed(w)
            };
            if word.len() < min_len {
                continue;
            }
            if stopwords_en && is_en_stopword(&word) {
                continue;
            }
            if !first {
                out.push('\n');
            }
            first = false;
            let stemmed = stem_one(&self.inner, &word);
            out.push_str(&stemmed);
        }
        out.into_bytes().into()
    }

    #[napi(getter)]
    pub fn language(&self) -> String {
        self.language.clone()
    }
}

/// Convenience for one-off usage. Documented as slow-path — don't call in
/// hot loops; use a `Stemmer` instance plus `stemMany` / `tokenizeAndStem`.
#[napi(js_name = "stemOnce")]
pub fn stem_once(language: String, word: String) -> Result<String> {
    let alg = resolve_algorithm(&language)?;
    let stemmer = InnerStemmer::create(alg);
    Ok(stem_one(&stemmer, &word).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_porter_stems_common_suffixes() {
        let s = Stemmer::new("english".to_string()).unwrap();
        let stems = s.stem_many(vec!["running".into(), "runs".into(), "runner".into()]);
        assert!(stems.iter().all(|x| x.starts_with("run")));
    }

    #[test]
    fn tokenize_and_stem_lowercases_by_default() {
        let s = Stemmer::new("english".to_string()).unwrap();
        let out = s.tokenize_and_stem("Running JUMPING Running".into(), None);
        assert!(out.iter().all(|w| w.chars().all(|c| !c.is_uppercase())));
    }

    #[test]
    fn tokenize_drops_short_tokens() {
        let s = Stemmer::new("english".to_string()).unwrap();
        let out = s.tokenize_and_stem(
            "a bb ccc dddd".into(),
            Some(TokenizeOptions {
                min_token_length: Some(3),
                ..Default::default()
            }),
        );
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn stopwords_dropped_for_english_only() {
        let en = Stemmer::new("english".to_string()).unwrap();
        let out = en.tokenize_and_stem(
            "the cat and the dog".into(),
            Some(TokenizeOptions {
                stopwords_en: Some(true),
                ..Default::default()
            }),
        );
        assert!(!out.contains(&"the".to_string()));
        assert!(!out.contains(&"and".to_string()));
    }

    #[test]
    fn unknown_language_errors() {
        assert!(Stemmer::new("klingon".to_string()).is_err());
    }

    #[test]
    fn stem_once_works_end_to_end() {
        let result = stem_once("english".to_string(), "running".to_string()).unwrap();
        assert!(result.starts_with("run"));
    }
}
