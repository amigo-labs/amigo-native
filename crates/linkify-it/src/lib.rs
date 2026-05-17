//! URL + email detection. Thin napi wrapper around `amigo-linkify-it-core`.

use amigo_linkify_it_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct LinkifyOptions {
    pub fuzzy_link: Option<bool>,
    pub fuzzy_email: Option<bool>,
}

#[napi(object)]
pub struct LinkMatch {
    pub schema: String,
    pub index: u32,
    pub last_index: u32,
    pub text: String,
    pub url: String,
}

fn into_core(o: Option<LinkifyOptions>) -> core::LinkifyOptions {
    let o = o.unwrap_or(LinkifyOptions {
        fuzzy_link: None,
        fuzzy_email: None,
    });
    core::LinkifyOptions {
        fuzzy_link: o.fuzzy_link,
        fuzzy_email: o.fuzzy_email,
    }
}

#[napi]
pub fn matches(text: String, options: Option<LinkifyOptions>) -> Vec<LinkMatch> {
    let opts = into_core(options);
    core::matches(&text, &opts)
        .into_iter()
        .map(|m| LinkMatch {
            schema: m.schema,
            index: m.index,
            last_index: m.last_index,
            text: m.text,
            url: m.url,
        })
        .collect()
}

#[napi]
pub fn test(text: String, options: Option<LinkifyOptions>) -> bool {
    let opts = into_core(options);
    core::test(&text, &opts)
}

#[napi(js_name = "matchOffsets")]
pub fn match_offsets(text: Buffer, options: Option<LinkifyOptions>) -> Result<Buffer> {
    let s = std::str::from_utf8(text.as_ref())
        .map_err(|e| Error::from_reason(format!("input is not valid UTF-8: {}", e)))?;
    let opts = into_core(options);
    Ok(core::match_offsets(s, &opts).into())
}
