//! WASM bindings for typst. Bundle is large (~5 MB gzipped with the
//! bundled font set) — pair with `await import(...)` in code-split
//! routes to avoid blowing up the initial chunk.

use amigo_typst_core as core;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
struct CompileOptionsJs {
    data: Option<HashMap<String, String>>,
    fonts: Option<Vec<Vec<u8>>>,
}

#[derive(Serialize)]
struct DiagnosticJs {
    severity: String,
    message: String,
}

#[derive(Serialize)]
struct CompileResultJs {
    pdf: Vec<u8>,
    warnings: Vec<DiagnosticJs>,
}

fn parse_opts(options: JsValue) -> Result<core::CompileOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::CompileOptions::default());
    }
    let v: CompileOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(core::CompileOptions {
        data: v.data,
        fonts: v.fonts,
    })
}

fn to_js(r: core::CompileResult) -> CompileResultJs {
    CompileResultJs {
        pdf: r.pdf,
        warnings: r
            .warnings
            .into_iter()
            .map(|d| DiagnosticJs {
                severity: d.severity,
                message: d.message,
            })
            .collect(),
    }
}

#[wasm_bindgen(js_name = "compile")]
pub fn compile(source: String, options: JsValue) -> Result<JsValue, JsError> {
    let r = core::compile(source, parse_opts(options)?).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&to_js(r)).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "compileMany")]
pub fn compile_many(sources: Vec<String>, options: JsValue) -> Result<JsValue, JsError> {
    let rs = core::compile_many(sources, parse_opts(options)?).map_err(|e| JsError::new(&e))?;
    let js: Vec<CompileResultJs> = rs.into_iter().map(to_js).collect();
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}
