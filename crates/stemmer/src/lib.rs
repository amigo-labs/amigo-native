//! Batch-only Porter/Snowball stemmer. Single-word stemming is intentionally
//! not exposed: it costs ~30 ns of JS work per call, which is smaller than
//! the 109 ns NAPI floor. Callers who think they want per-word stemming
//! should use `tokenizeAndStem` instead.
//!
//! Thin napi wrapper around `amigo-stemmer-core`.

use amigo_stemmer_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

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

fn into_core(o: Option<TokenizeOptions>) -> core::TokenizeOptions {
    let o = o.unwrap_or_default();
    core::TokenizeOptions {
        lowercase: o.lowercase,
        min_token_length: o.min_token_length,
        stopwords_en: o.stopwords_en,
    }
}

#[napi]
pub struct Stemmer {
    inner: core::Stemmer,
}

#[napi]
impl Stemmer {
    #[napi(constructor)]
    pub fn new(language: String) -> Result<Self> {
        let inner = core::Stemmer::new(language).map_err(Error::from_reason)?;
        Ok(Self { inner })
    }

    /// Batch-stem a list of whole words. One FFI crossing each way.
    #[napi]
    pub fn stem_many(&self, words: Vec<String>) -> Vec<String> {
        self.inner.stem_many(words)
    }

    /// Stem a newline-delimited buffer; output is newline-delimited.
    #[napi]
    pub fn stem_buffer(&self, buffer: Buffer) -> Result<Buffer> {
        self.inner
            .stem_buffer(buffer.as_ref())
            .map(Buffer::from)
            .map_err(Error::from_reason)
    }

    /// Tokenize text (unicode-word-aware) and stem every token in one FFI
    /// crossing. This is the realistic hot-path.
    #[napi]
    pub fn tokenize_and_stem(&self, text: String, options: Option<TokenizeOptions>) -> Vec<String> {
        let opts = into_core(options);
        self.inner.tokenize_and_stem(&text, &opts)
    }

    /// Tokenize-and-stem variant that returns a newline-delimited Buffer.
    #[napi]
    pub fn tokenize_and_stem_to_buffer(
        &self,
        text: String,
        options: Option<TokenizeOptions>,
    ) -> Buffer {
        let opts = into_core(options);
        Buffer::from(self.inner.tokenize_and_stem_to_buffer(&text, &opts))
    }

    #[napi(getter)]
    pub fn language(&self) -> String {
        self.inner.language().to_string()
    }
}

/// Convenience for one-off usage. Documented as slow-path.
#[napi(js_name = "stemOnce")]
pub fn stem_once(language: String, word: String) -> Result<String> {
    core::stem_once(&language, &word).map_err(Error::from_reason)
}
