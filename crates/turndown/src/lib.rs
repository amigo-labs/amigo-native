//! HTML → Markdown — thin napi wrapper around `amigo-turndown-core`.

use amigo_turndown_core as core;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Default)]
pub struct TurndownOptions {
    pub heading_style: Option<String>,
    pub hr: Option<String>,
    pub bullet_list_marker: Option<String>,
    pub code_block_style: Option<String>,
    pub fence: Option<String>,
    pub em_delimiter: Option<String>,
    pub strong_delimiter: Option<String>,
    pub link_style: Option<String>,
    pub gfm: Option<bool>,
    pub keep: Option<Vec<String>>,
    pub remove: Option<Vec<String>>,
}

fn into_core(o: TurndownOptions) -> core::TurndownOptions {
    core::TurndownOptions {
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

#[napi(js_name = "turndown")]
pub fn turndown(html: String, options: Option<TurndownOptions>) -> String {
    let opts = into_core(options.unwrap_or_default());
    core::turndown(&html, &opts)
}

#[napi(js_name = "turndownBatch")]
pub fn turndown_batch(htmls: Vec<String>, options: Option<TurndownOptions>) -> Vec<String> {
    let opts = into_core(options.unwrap_or_default());
    core::turndown_batch(&htmls, &opts)
}
