use amigo_language_detect_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectOptionsJs {
    min_length: Option<u32>,
    only: Option<Vec<String>>,
    ignore: Option<Vec<String>>,
}

impl From<DetectOptionsJs> for core::DetectOptions {
    fn from(v: DetectOptionsJs) -> Self {
        Self {
            min_length: v.min_length,
            only: v.only,
            ignore: v.ignore,
        }
    }
}

#[derive(Serialize)]
struct LanguageMatchJs {
    lang: String,
    confidence: f64,
}

fn parse_opts(options: JsValue) -> Result<core::DetectOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::DetectOptions::default());
    }
    let opts: DetectOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(opts.into())
}

#[wasm_bindgen]
pub fn detect(text: &str, options: JsValue) -> Result<String, JsError> {
    Ok(core::detect(text, &parse_opts(options)?))
}

#[wasm_bindgen(js_name = "detectIfLong")]
pub fn detect_if_long(text: &str, options: JsValue) -> Result<Option<String>, JsError> {
    Ok(core::detect_if_long(text, &parse_opts(options)?))
}

#[wasm_bindgen(js_name = "detectAll")]
pub fn detect_all(text: &str, options: JsValue) -> Result<JsValue, JsError> {
    let matches: Vec<LanguageMatchJs> = core::detect_all(text, &parse_opts(options)?)
        .into_iter()
        .map(|m| LanguageMatchJs {
            lang: m.lang,
            confidence: m.confidence,
        })
        .collect();
    serde_wasm_bindgen::to_value(&matches).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "detectMany")]
pub fn detect_many(texts: Vec<String>, options: JsValue) -> Result<Vec<String>, JsError> {
    Ok(core::detect_many(texts, &parse_opts(options)?))
}

#[wasm_bindgen(js_name = "languageExists")]
pub fn language_exists(code: &str) -> bool {
    core::language_exists(code)
}
