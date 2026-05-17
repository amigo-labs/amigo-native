//! Typst document compilation — thin napi wrapper around
//! `amigo-typst-core`.

use amigo_typst_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
#[derive(Default)]
pub struct CompileOptions {
    pub data: Option<HashMap<String, String>>,
    pub fonts: Option<Vec<Buffer>>,
}

#[napi(object)]
pub struct Diagnostic {
    pub severity: String,
    pub message: String,
}

#[napi(object)]
pub struct CompileResult {
    pub pdf: Buffer,
    pub warnings: Vec<Diagnostic>,
}

fn into_core(opts: Option<CompileOptions>) -> core::CompileOptions {
    let o = opts.unwrap_or_default();
    core::CompileOptions {
        data: o.data,
        fonts: o
            .fonts
            .map(|fs| fs.into_iter().map(|b| b.to_vec()).collect()),
    }
}

fn to_napi(r: core::CompileResult) -> CompileResult {
    CompileResult {
        pdf: r.pdf.into(),
        warnings: r
            .warnings
            .into_iter()
            .map(|d| Diagnostic {
                severity: d.severity,
                message: d.message,
            })
            .collect(),
    }
}

#[napi(js_name = "compile")]
pub fn compile(source: String, options: Option<CompileOptions>) -> Result<CompileResult> {
    core::compile(source, into_core(options))
        .map(to_napi)
        .map_err(Error::from_reason)
}

#[napi(js_name = "compileMany")]
pub fn compile_many(
    sources: Vec<String>,
    options: Option<CompileOptions>,
) -> Result<Vec<CompileResult>> {
    core::compile_many(sources, into_core(options))
        .map(|v| v.into_iter().map(to_napi).collect())
        .map_err(Error::from_reason)
}
