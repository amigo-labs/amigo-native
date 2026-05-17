//! PDF text + metadata extraction — thin napi wrapper around
//! `amigo-pdf-parse-core`.

use amigo_pdf_parse_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
#[derive(Clone, Default)]
pub struct PdfParseOptions {
    pub max: Option<u32>,
    pub password: Option<String>,
}

#[napi(object)]
pub struct PdfParseResult {
    pub text: String,
    pub numpages: u32,
    pub info: HashMap<String, String>,
    pub metadata: Option<String>,
    pub version: String,
}

fn into_core(o: PdfParseOptions) -> core::PdfParseOptions {
    core::PdfParseOptions {
        max: o.max,
        password: o.password,
    }
}

fn to_napi(r: core::PdfParseResult) -> PdfParseResult {
    PdfParseResult {
        text: r.text,
        numpages: r.numpages,
        info: r.info,
        metadata: r.metadata,
        version: r.version,
    }
}

#[napi(js_name = "parseSync")]
pub fn parse_sync(buf: Buffer, options: Option<PdfParseOptions>) -> Result<PdfParseResult> {
    let opts = into_core(options.unwrap_or_default());
    core::parse(buf.as_ref(), &opts)
        .map(to_napi)
        .map_err(Error::from_reason)
}

#[napi(js_name = "parse")]
pub fn parse(buf: Buffer, options: Option<PdfParseOptions>) -> AsyncTask<ParseTask> {
    AsyncTask::new(ParseTask {
        bytes: buf.to_vec(),
        options: into_core(options.unwrap_or_default()),
    })
}

pub struct ParseTask {
    bytes: Vec<u8>,
    options: core::PdfParseOptions,
}

impl Task for ParseTask {
    type Output = core::PdfParseResult;
    type JsValue = PdfParseResult;

    fn compute(&mut self) -> Result<Self::Output> {
        core::parse(&self.bytes, &self.options).map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(to_napi(output))
    }
}
