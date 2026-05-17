use amigo_csv_core as core;
use serde::Deserialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CsvOptionsJs {
    delimiter: Option<u32>,
    has_headers: Option<bool>,
    quote_char: Option<u32>,
    escape_char: Option<u32>,
    comment: Option<u32>,
    flexible: Option<bool>,
    trim_fields: Option<bool>,
}

impl From<CsvOptionsJs> for core::CsvOptions {
    fn from(v: CsvOptionsJs) -> Self {
        Self {
            delimiter: v.delimiter,
            has_headers: v.has_headers,
            quote_char: v.quote_char,
            escape_char: v.escape_char,
            comment: v.comment,
            flexible: v.flexible,
            trim_fields: v.trim_fields,
        }
    }
}

fn parse_opts(options: JsValue) -> Result<core::CsvOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::CsvOptions::default());
    }
    let v: CsvOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen]
pub fn parse(input: &[u8], options: JsValue) -> Result<JsValue, JsError> {
    let rows = core::parse(input, &parse_opts(options)?).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&rows).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "parseStr")]
pub fn parse_str(input: &str, options: JsValue) -> Result<JsValue, JsError> {
    parse(input.as_bytes(), options)
}

#[wasm_bindgen(js_name = "parseWithHeaders")]
pub fn parse_with_headers(input: &[u8], options: JsValue) -> Result<JsValue, JsError> {
    let rows =
        core::parse_with_headers(input, &parse_opts(options)?).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&rows).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn stringify(rows: JsValue, options: JsValue) -> Result<String, JsError> {
    let rs: Vec<Vec<String>> =
        serde_wasm_bindgen::from_value(rows).map_err(|e| JsError::new(&e.to_string()))?;
    core::stringify(rs, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "stringifyObjects")]
pub fn stringify_objects(
    rows: JsValue,
    columns: Option<Vec<String>>,
    options: JsValue,
) -> Result<String, JsError> {
    let rs: Vec<HashMap<String, String>> =
        serde_wasm_bindgen::from_value(rows).map_err(|e| JsError::new(&e.to_string()))?;
    core::stringify_objects(rs, columns, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "countRows")]
pub fn count_rows(input: &[u8], options: JsValue) -> Result<u32, JsError> {
    core::count_rows(input, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "parseToJson")]
pub fn parse_to_json(input: &[u8], options: JsValue) -> Result<String, JsError> {
    core::parse_to_json(input, &parse_opts(options)?).map_err(|e| JsError::new(&e))
}
