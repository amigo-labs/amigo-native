use amigo_svgo_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SvgoConfigJs {
    remove_comments: Option<bool>,
    remove_metadata: Option<bool>,
    remove_title: Option<bool>,
    remove_desc: Option<bool>,
    remove_doctype: Option<bool>,
    remove_xml_proc_inst: Option<bool>,
    remove_editors_ns_data: Option<bool>,
    remove_empty_attrs: Option<bool>,
    remove_empty_text: Option<bool>,
    remove_empty_containers: Option<bool>,
    remove_hidden_elems: Option<bool>,
    remove_useless_defs: Option<bool>,
    cleanup_numeric_values: Option<bool>,
    cleanup_attrs: Option<bool>,
    collapse_groups: Option<bool>,
    convert_colors: Option<bool>,
    collapse_whitespace: Option<bool>,
    float_precision: Option<u32>,
    multipass: Option<bool>,
}

impl From<SvgoConfigJs> for core::SvgoConfig {
    fn from(c: SvgoConfigJs) -> Self {
        Self {
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
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SvgoResultJs {
    data: String,
    input_bytes: u32,
    output_bytes: u32,
    saved_percent: f64,
}

impl From<core::SvgoResult> for SvgoResultJs {
    fn from(r: core::SvgoResult) -> Self {
        Self {
            data: r.data,
            input_bytes: r.input_bytes,
            output_bytes: r.output_bytes,
            saved_percent: r.saved_percent,
        }
    }
}

fn parse_cfg(config: JsValue) -> Result<core::SvgoConfig, JsError> {
    if config.is_undefined() || config.is_null() {
        return Ok(core::SvgoConfig::default());
    }
    let v: SvgoConfigJs =
        serde_wasm_bindgen::from_value(config).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen(js_name = "optimize")]
pub fn optimize(svg: &str, config: JsValue) -> Result<JsValue, JsError> {
    let cfg = parse_cfg(config)?;
    let result: SvgoResultJs = core::optimize(svg, &cfg).into();
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "optimizeMany")]
pub fn optimize_many(svgs: Vec<String>, config: JsValue) -> Result<JsValue, JsError> {
    let cfg = parse_cfg(config)?;
    let results: Vec<SvgoResultJs> = core::optimize_many(&svgs, &cfg)
        .into_iter()
        .map(Into::into)
        .collect();
    serde_wasm_bindgen::to_value(&results).map_err(|e| JsError::new(&e.to_string()))
}
