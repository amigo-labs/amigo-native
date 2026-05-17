//! SVG optimizer — thin napi wrapper around `amigo-svgo-core`.

use amigo_svgo_core as core;
use napi_derive::napi;

#[napi(object)]
pub struct SvgoConfig {
    pub remove_comments: Option<bool>,
    pub remove_metadata: Option<bool>,
    pub remove_title: Option<bool>,
    pub remove_desc: Option<bool>,
    pub remove_doctype: Option<bool>,
    pub remove_xml_proc_inst: Option<bool>,
    pub remove_editors_ns_data: Option<bool>,
    pub remove_empty_attrs: Option<bool>,
    pub remove_empty_text: Option<bool>,
    pub remove_empty_containers: Option<bool>,
    pub remove_hidden_elems: Option<bool>,
    pub remove_useless_defs: Option<bool>,
    pub cleanup_numeric_values: Option<bool>,
    pub cleanup_attrs: Option<bool>,
    pub collapse_groups: Option<bool>,
    pub convert_colors: Option<bool>,
    pub collapse_whitespace: Option<bool>,
    pub float_precision: Option<u32>,
    pub multipass: Option<bool>,
}

#[napi(object)]
pub struct SvgoResult {
    pub data: String,
    pub input_bytes: u32,
    pub output_bytes: u32,
    pub saved_percent: f64,
}

fn into_core(c: Option<SvgoConfig>) -> core::SvgoConfig {
    match c {
        Some(c) => core::SvgoConfig {
            remove_comments: c.remove_comments,
            remove_metadata: c.remove_metadata,
            remove_title: c.remove_title,
            remove_desc: c.remove_desc,
            remove_doctype: c.remove_doctype,
            remove_xml_proc_inst: c.remove_xml_proc_inst,
            remove_editors_ns_data: c.remove_editors_ns_data,
            remove_empty_attrs: c.remove_empty_attrs,
            remove_empty_text: c.remove_empty_text,
            remove_empty_containers: c.remove_empty_containers,
            remove_hidden_elems: c.remove_hidden_elems,
            remove_useless_defs: c.remove_useless_defs,
            cleanup_numeric_values: c.cleanup_numeric_values,
            cleanup_attrs: c.cleanup_attrs,
            collapse_groups: c.collapse_groups,
            convert_colors: c.convert_colors,
            collapse_whitespace: c.collapse_whitespace,
            float_precision: c.float_precision,
            multipass: c.multipass,
        },
        None => core::SvgoConfig::default(),
    }
}

fn to_napi(r: core::SvgoResult) -> SvgoResult {
    SvgoResult {
        data: r.data,
        input_bytes: r.input_bytes,
        output_bytes: r.output_bytes,
        saved_percent: r.saved_percent,
    }
}

#[napi(js_name = "optimize")]
pub fn optimize(svg: String, config: Option<SvgoConfig>) -> SvgoResult {
    to_napi(core::optimize(&svg, &into_core(config)))
}

#[napi(js_name = "optimizeMany")]
pub fn optimize_many(svgs: Vec<String>, config: Option<SvgoConfig>) -> Vec<SvgoResult> {
    let opts = into_core(config);
    core::optimize_many(&svgs, &opts)
        .into_iter()
        .map(to_napi)
        .collect()
}
