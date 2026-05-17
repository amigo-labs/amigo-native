//! Text splitters for RAG pipelines — thin napi wrapper around
//! `amigo-text-splitters-core`.

use amigo_text_splitters_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Default)]
pub struct SplitterOptions {
    pub chunk_size: Option<u32>,
    pub chunk_overlap: Option<u32>,
    pub length_metric: Option<String>,
}

fn into_core(o: Option<SplitterOptions>) -> core::SplitterOptions {
    let o = o.unwrap_or_default();
    core::SplitterOptions {
        chunk_size: o.chunk_size,
        chunk_overlap: o.chunk_overlap,
        length_metric: o.length_metric,
    }
}

#[napi(js_name = "splitText")]
pub fn split_text(text: String, options: Option<SplitterOptions>) -> Result<Vec<String>> {
    core::split_text(&text, &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "splitTextBatch")]
pub fn split_text_batch(
    texts: Vec<String>,
    options: Option<SplitterOptions>,
) -> Result<Vec<Vec<String>>> {
    let opts = into_core(options);
    texts
        .into_iter()
        .map(|t| core::split_text(&t, &opts).map_err(Error::from_reason))
        .collect()
}

#[napi(js_name = "splitMarkdown")]
pub fn split_markdown(text: String, options: Option<SplitterOptions>) -> Result<Vec<String>> {
    core::split_markdown(&text, &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "splitMarkdownBatch")]
pub fn split_markdown_batch(
    texts: Vec<String>,
    options: Option<SplitterOptions>,
) -> Result<Vec<Vec<String>>> {
    let opts = into_core(options);
    texts
        .into_iter()
        .map(|t| core::split_markdown(&t, &opts).map_err(Error::from_reason))
        .collect()
}

#[napi(js_name = "countChars")]
pub fn count_chars(text: String) -> u32 {
    core::count_chars(&text) as u32
}

#[napi(js_name = "countTokens")]
pub fn count_tokens(text: String, encoding: Option<String>) -> Result<u32> {
    core::count_tokens(&text, encoding.as_deref())
        .map(|n| n as u32)
        .map_err(Error::from_reason)
}
