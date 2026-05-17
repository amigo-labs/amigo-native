use amigo_turndown_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurndownOptionsJs {
    heading_style: Option<String>,
    hr: Option<String>,
    bullet_list_marker: Option<String>,
    code_block_style: Option<String>,
    fence: Option<String>,
    em_delimiter: Option<String>,
    strong_delimiter: Option<String>,
    link_style: Option<String>,
    gfm: Option<bool>,
    keep: Option<Vec<String>>,
    remove: Option<Vec<String>>,
}

impl From<TurndownOptionsJs> for core::TurndownOptions {
    fn from(o: TurndownOptionsJs) -> Self {
        Self {
            heading_style: o.heading_style,
            hr: o.hr,
            bullet_list_marker: o.bullet_list_marker,
            code_block_style: o.code_block_style,
            fence: o.fence,
            em_delimiter: o.em_delimiter,
            strong_delimiter: o.strong_delimiter,
            link_style: o.link_style,
            gfm: o.gfm,
            keep: o.keep,
            remove: o.remove,
        }
    }
}

fn parse_opts(options: JsValue) -> Result<core::TurndownOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::TurndownOptions::default());
    }
    let v: TurndownOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen(js_name = "turndown")]
pub fn turndown(html: &str, options: JsValue) -> Result<String, JsError> {
    Ok(core::turndown(html, &parse_opts(options)?))
}

#[wasm_bindgen(js_name = "turndownBatch")]
pub fn turndown_batch(htmls: Vec<String>, options: JsValue) -> Result<Vec<String>, JsError> {
    Ok(core::turndown_batch(&htmls, &parse_opts(options)?))
}
