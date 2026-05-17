//! CommonMark + GFM rendering — thin napi wrapper around
//! `amigo-commonmark-core`. The parallel `renderMany` lives here
//! (rayon doesn't run usefully under wasm32, so the wasm wrapper
//! falls back to a serial loop).

use amigo_commonmark_core as core;
use napi::bindgen_prelude::{Buffer, Error, Result, Status};
use napi_derive::napi;
use rayon::prelude::*;

#[napi(object)]
#[derive(Default, Clone)]
pub struct CommonMarkOptions {
    pub gfm: Option<bool>,
    pub footnotes: Option<bool>,
    pub smart_punctuation: Option<bool>,
    pub unsafe_html: Option<bool>,
    pub heading_ids: Option<bool>,
}

fn to_core(o: Option<&CommonMarkOptions>) -> core::CommonMarkOptions {
    match o {
        Some(o) => core::CommonMarkOptions {
            gfm: o.gfm,
            footnotes: o.footnotes,
            smart_punctuation: o.smart_punctuation,
            unsafe_html: o.unsafe_html,
            heading_ids: o.heading_ids,
        },
        None => core::CommonMarkOptions::default(),
    }
}

fn resolve(o: Option<&CommonMarkOptions>) -> core::Resolved {
    let core_opts = to_core(o);
    core::resolve(Some(&core_opts))
}

fn decode_utf8(buf: &[u8]) -> Result<&str> {
    std::str::from_utf8(buf)
        .map_err(|e| Error::new(Status::InvalidArg, format!("input is not valid UTF-8: {e}")))
}

#[napi]
pub fn render(markdown: String, options: Option<CommonMarkOptions>) -> String {
    core::render_str(&markdown, resolve(options.as_ref()))
}

#[napi(js_name = "renderBytes")]
pub fn render_bytes(markdown: Buffer, options: Option<CommonMarkOptions>) -> Result<String> {
    let s = decode_utf8(&markdown)?;
    Ok(core::render_str(s, resolve(options.as_ref())))
}

#[napi(js_name = "renderFast")]
pub fn render_fast(markdown: String) -> String {
    core::render_str(&markdown, core::FAST_RESOLVED)
}

#[napi(js_name = "renderBytesFast")]
pub fn render_bytes_fast(markdown: Buffer) -> Result<String> {
    let s = decode_utf8(&markdown)?;
    Ok(core::render_str(s, core::FAST_RESOLVED))
}

#[napi(js_name = "renderMany")]
pub fn render_many(docs: Vec<String>, options: Option<CommonMarkOptions>) -> Vec<String> {
    let r = resolve(options.as_ref());
    if docs.len() >= 8 && docs.iter().any(|d| d.len() >= 512) {
        docs.par_iter().map(|d| core::render_str(d, r)).collect()
    } else {
        docs.iter().map(|d| core::render_str(d, r)).collect()
    }
}

#[napi]
pub struct Renderer {
    resolved: core::Resolved,
}

#[napi]
impl Renderer {
    #[napi(constructor)]
    pub fn new(options: Option<CommonMarkOptions>) -> Self {
        Self {
            resolved: resolve(options.as_ref()),
        }
    }

    #[napi]
    pub fn render(&self, markdown: String) -> String {
        core::render_str(&markdown, self.resolved)
    }

    #[napi(js_name = "renderBytes")]
    pub fn render_bytes(&self, markdown: Buffer) -> Result<String> {
        let s = decode_utf8(&markdown)?;
        Ok(core::render_str(s, self.resolved))
    }
}
