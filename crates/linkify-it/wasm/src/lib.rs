use amigo_linkify_it_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkifyOptionsJs {
    fuzzy_link: Option<bool>,
    fuzzy_email: Option<bool>,
}

impl From<LinkifyOptionsJs> for core::LinkifyOptions {
    fn from(v: LinkifyOptionsJs) -> Self {
        Self {
            fuzzy_link: v.fuzzy_link,
            fuzzy_email: v.fuzzy_email,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkMatchJs {
    schema: String,
    index: u32,
    last_index: u32,
    text: String,
    url: String,
}

fn parse_opts(options: JsValue) -> Result<core::LinkifyOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::LinkifyOptions::default());
    }
    let v: LinkifyOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen]
pub fn matches(text: &str, options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let out: Vec<LinkMatchJs> = core::matches(text, &opts)
        .into_iter()
        .map(|m| LinkMatchJs {
            schema: m.schema,
            index: m.index,
            last_index: m.last_index,
            text: m.text,
            url: m.url,
        })
        .collect();
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn test(text: &str, options: JsValue) -> Result<bool, JsError> {
    Ok(core::test(text, &parse_opts(options)?))
}

#[wasm_bindgen(js_name = "matchOffsets")]
pub fn match_offsets(text: &str, options: JsValue) -> Result<Vec<u8>, JsError> {
    Ok(core::match_offsets(text, &parse_opts(options)?))
}
