//! Public Suffix List parsing — thin napi wrapper around `amigo-tldts-core`.

use amigo_tldts_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct ParseResult {
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub subdomain: Option<String>,
    pub public_suffix: Option<String>,
    pub is_icann: bool,
    pub is_private: bool,
    pub is_ip: bool,
}

#[napi(object)]
pub struct ParseOptions {
    pub allow_private_domains: Option<bool>,
    pub detect_ip: Option<bool>,
    pub extract_hostname: Option<bool>,
}

fn into_core(o: Option<ParseOptions>) -> core::ParseOptions {
    let o = o.unwrap_or(ParseOptions {
        allow_private_domains: None,
        detect_ip: None,
        extract_hostname: None,
    });
    core::ParseOptions {
        allow_private_domains: o.allow_private_domains,
        detect_ip: o.detect_ip,
        extract_hostname: o.extract_hostname,
    }
}

fn to_napi(r: core::ParseResult) -> ParseResult {
    ParseResult {
        hostname: r.hostname,
        domain: r.domain,
        subdomain: r.subdomain,
        public_suffix: r.public_suffix,
        is_icann: r.is_icann,
        is_private: r.is_private,
        is_ip: r.is_ip,
    }
}

#[napi]
pub fn parse(input: String, options: Option<ParseOptions>) -> ParseResult {
    let opts = into_core(options);
    to_napi(core::parse_one(&input, &opts))
}

#[napi(js_name = "getDomain")]
pub fn get_domain(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).domain
}

#[napi(js_name = "getPublicSuffix")]
pub fn get_public_suffix(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).public_suffix
}

#[napi(js_name = "getHostname")]
pub fn get_hostname(input: String) -> Option<String> {
    core::get_hostname(&input)
}

#[napi(js_name = "getSubdomain")]
pub fn get_subdomain(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).subdomain
}

#[napi(object)]
pub struct ParseManyResult {
    pub domains: Vec<Option<String>>,
    pub public_suffixes: Vec<Option<String>>,
    pub flags: Buffer,
}

#[napi(js_name = "parseMany")]
pub fn parse_many(inputs: Vec<String>, options: Option<ParseOptions>) -> ParseManyResult {
    let opts = into_core(options);
    let r = core::parse_many(&inputs, &opts);
    ParseManyResult {
        domains: r.domains,
        public_suffixes: r.public_suffixes,
        flags: r.flags.into(),
    }
}
