use amigo_stemmer_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenizeOptionsJs {
    lowercase: Option<bool>,
    min_token_length: Option<u32>,
    stopwords_en: Option<bool>,
}

impl From<TokenizeOptionsJs> for core::TokenizeOptions {
    fn from(v: TokenizeOptionsJs) -> Self {
        Self {
            lowercase: v.lowercase,
            min_token_length: v.min_token_length,
            stopwords_en: v.stopwords_en,
        }
    }
}

fn parse_opts(options: JsValue) -> Result<core::TokenizeOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::TokenizeOptions::default());
    }
    let v: TokenizeOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen]
pub struct Stemmer {
    inner: core::Stemmer,
}

#[wasm_bindgen]
impl Stemmer {
    #[wasm_bindgen(constructor)]
    pub fn new(language: String) -> Result<Stemmer, JsError> {
        core::Stemmer::new(language)
            .map(|inner| Stemmer { inner })
            .map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = "stemMany")]
    pub fn stem_many(&self, words: Vec<String>) -> Vec<String> {
        self.inner.stem_many(words)
    }

    #[wasm_bindgen(js_name = "stemBuffer")]
    pub fn stem_buffer(&self, buffer: &[u8]) -> Result<Vec<u8>, JsError> {
        self.inner.stem_buffer(buffer).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = "tokenizeAndStem")]
    pub fn tokenize_and_stem(&self, text: &str, options: JsValue) -> Result<Vec<String>, JsError> {
        let opts = parse_opts(options)?;
        Ok(self.inner.tokenize_and_stem(text, &opts))
    }

    #[wasm_bindgen(js_name = "tokenizeAndStemToBuffer")]
    pub fn tokenize_and_stem_to_buffer(
        &self,
        text: &str,
        options: JsValue,
    ) -> Result<Vec<u8>, JsError> {
        let opts = parse_opts(options)?;
        Ok(self.inner.tokenize_and_stem_to_buffer(text, &opts))
    }

    #[wasm_bindgen(getter)]
    pub fn language(&self) -> String {
        self.inner.language().to_string()
    }
}

#[wasm_bindgen(js_name = "stemOnce")]
pub fn stem_once(language: &str, word: &str) -> Result<String, JsError> {
    core::stem_once(language, word).map_err(|e| JsError::new(&e))
}
