//! WASM bindings for commonmark. The napi `renderBytes` / `renderBytesFast`
//! variants are dropped — Buffer doesn't exist in the browser, and string
//! input via `&str` already skips the V8 UTF-16 copy for wasm callers.
//! `renderMany` runs serially (no rayon under wasm32).

use amigo_commonmark_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommonMarkOptionsJs {
    gfm: Option<bool>,
    footnotes: Option<bool>,
    smart_punctuation: Option<bool>,
    unsafe_html: Option<bool>,
    heading_ids: Option<bool>,
}

impl From<CommonMarkOptionsJs> for core::CommonMarkOptions {
    fn from(o: CommonMarkOptionsJs) -> Self {
        Self {
            gfm: o.gfm,
            footnotes: o.footnotes,
            smart_punctuation: o.smart_punctuation,
            unsafe_html: o.unsafe_html,
            heading_ids: o.heading_ids,
        }
    }
}

fn parse_opts(options: JsValue) -> Result<core::Resolved, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::resolve(None));
    }
    let o: CommonMarkOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    let core_opts: core::CommonMarkOptions = o.into();
    Ok(core::resolve(Some(&core_opts)))
}

#[wasm_bindgen]
pub fn render(markdown: &str, options: JsValue) -> Result<String, JsError> {
    Ok(core::render_str(markdown, parse_opts(options)?))
}

#[wasm_bindgen(js_name = "renderFast")]
pub fn render_fast(markdown: &str) -> String {
    core::render_str(markdown, core::FAST_RESOLVED)
}

#[wasm_bindgen(js_name = "renderMany")]
pub fn render_many(docs: Vec<String>, options: JsValue) -> Result<Vec<String>, JsError> {
    let r = parse_opts(options)?;
    Ok(docs.iter().map(|d| core::render_str(d, r)).collect())
}

#[wasm_bindgen]
pub struct Renderer {
    resolved: core::Resolved,
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(options: JsValue) -> Result<Renderer, JsError> {
        Ok(Renderer {
            resolved: parse_opts(options)?,
        })
    }

    #[wasm_bindgen]
    pub fn render(&self, markdown: &str) -> String {
        core::render_str(markdown, self.resolved)
    }
}
