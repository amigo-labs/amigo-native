//! Shared Porter/Snowball stemming logic. Internal-only crate; the napi
//! and WASM bindings wrap `Stemmer::new(language)` then call the batch
//! entry points. See `crates/stemmer/` for the public surface.

use rust_stemmers::{Algorithm, Stemmer as InnerStemmer};
use std::borrow::Cow;
use unicode_segmentation::UnicodeSegmentation;

pub fn resolve_algorithm(lang: &str) -> Result<Algorithm, String> {
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
        other => Err(format!("unknown stemmer language: {other}")),
    }
}

const EN_STOPWORDS: &[&str] = &[
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "com", "de", "en", "for", "from",
    "how", "i", "in", "is", "it", "la", "of", "on", "or", "that", "the", "this", "to", "was",
    "what", "when", "where", "who", "will", "with", "und", "www",
];

#[inline]
pub fn is_en_stopword(tok: &str) -> bool {
    EN_STOPWORDS.contains(&tok)
}

pub fn stem_one<'a>(stemmer: &InnerStemmer, word: &'a str) -> Cow<'a, str> {
    stemmer.stem(word)
}

#[derive(Default, Debug, Clone, Copy)]
pub struct TokenizeOptions {
    pub lowercase: Option<bool>,
    pub min_token_length: Option<u32>,
    pub stopwords_en: Option<bool>,
}

pub struct Stemmer {
    inner: InnerStemmer,
    language: String,
}

impl Stemmer {
    pub fn new(language: String) -> Result<Self, String> {
        let alg = resolve_algorithm(&language)?;
        Ok(Self {
            inner: InnerStemmer::create(alg),
            language,
        })
    }

    pub fn language(&self) -> &str {
        &self.language
    }

    pub fn stem_many(&self, words: Vec<String>) -> Vec<String> {
        words
            .into_iter()
            .map(|w| stem_one(&self.inner, &w).into_owned())
            .collect()
    }

    /// Stem a newline-delimited buffer. Returns newline-delimited UTF-8.
    pub fn stem_buffer(&self, buffer: &[u8]) -> Result<Vec<u8>, String> {
        let input = std::str::from_utf8(buffer).map_err(|e| e.to_string())?;
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
        Ok(out.into_bytes())
    }

    pub fn tokenize_and_stem(&self, text: &str, opts: &TokenizeOptions) -> Vec<String> {
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

    pub fn tokenize_and_stem_to_buffer(&self, text: &str, opts: &TokenizeOptions) -> Vec<u8> {
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
        out.into_bytes()
    }
}

pub fn stem_once(language: &str, word: &str) -> Result<String, String> {
    let alg = resolve_algorithm(language)?;
    let stemmer = InnerStemmer::create(alg);
    Ok(stem_one(&stemmer, word).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stem_once_english() {
        assert_eq!(stem_once("english", "running").unwrap(), "run");
    }

    #[test]
    fn stem_once_german() {
        assert_eq!(stem_once("german", "läuft").unwrap(), "lauft");
    }

    #[test]
    fn unknown_language_errors() {
        assert!(resolve_algorithm("klingon").is_err());
    }

    #[test]
    fn stemmer_tokenize_and_stem_filters_short_tokens() {
        let s = Stemmer::new("english".to_string()).unwrap();
        let out = s.tokenize_and_stem(
            "a quick run",
            &TokenizeOptions {
                min_token_length: Some(3),
                ..Default::default()
            },
        );
        assert_eq!(out, vec!["quick".to_string(), "run".to_string()]);
    }
}
