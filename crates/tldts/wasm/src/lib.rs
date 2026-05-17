use amigo_tldts_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParseOptionsJs {
    allow_private_domains: Option<bool>,
    detect_ip: Option<bool>,
    extract_hostname: Option<bool>,
}

impl From<ParseOptionsJs> for core::ParseOptions {
    fn from(v: ParseOptionsJs) -> Self {
        Self {
            allow_private_domains: v.allow_private_domains,
            detect_ip: v.detect_ip,
            extract_hostname: v.extract_hostname,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseResultJs {
    hostname: Option<String>,
    domain: Option<String>,
    subdomain: Option<String>,
    public_suffix: Option<String>,
    is_icann: bool,
    is_private: bool,
    is_ip: bool,
}

impl From<core::ParseResult> for ParseResultJs {
    fn from(r: core::ParseResult) -> Self {
        Self {
            hostname: r.hostname,
            domain: r.domain,
            subdomain: r.subdomain,
            public_suffix: r.public_suffix,
            is_icann: r.is_icann,
            is_private: r.is_private,
            is_ip: r.is_ip,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseManyResultJs {
    domains: Vec<Option<String>>,
    public_suffixes: Vec<Option<String>>,
    flags: Vec<u8>,
}

fn parse_opts(options: JsValue) -> Result<core::ParseOptions, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok(core::ParseOptions::default());
    }
    let v: ParseOptionsJs =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(v.into())
}

#[wasm_bindgen]
pub fn parse(input: &str, options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let r: ParseResultJs = core::parse_one(input, &opts).into();
    serde_wasm_bindgen::to_value(&r).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "getDomain")]
pub fn get_domain(input: &str, options: JsValue) -> Result<Option<String>, JsError> {
    let opts = parse_opts(options)?;
    Ok(core::parse_one(input, &opts).domain)
}

#[wasm_bindgen(js_name = "getPublicSuffix")]
pub fn get_public_suffix(input: &str, options: JsValue) -> Result<Option<String>, JsError> {
    let opts = parse_opts(options)?;
    Ok(core::parse_one(input, &opts).public_suffix)
}

#[wasm_bindgen(js_name = "getHostname")]
pub fn get_hostname(input: &str) -> Option<String> {
    core::get_hostname(input)
}

#[wasm_bindgen(js_name = "getSubdomain")]
pub fn get_subdomain(input: &str, options: JsValue) -> Result<Option<String>, JsError> {
    let opts = parse_opts(options)?;
    Ok(core::parse_one(input, &opts).subdomain)
}

#[wasm_bindgen(js_name = "parseMany")]
pub fn parse_many(inputs: Vec<String>, options: JsValue) -> Result<JsValue, JsError> {
    let opts = parse_opts(options)?;
    let r = core::parse_many(&inputs, &opts);
    let js = ParseManyResultJs {
        domains: r.domains,
        public_suffixes: r.public_suffixes,
        flags: r.flags,
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}
