//! CSV parse/stringify — thin napi wrapper around `amigo-csv-core`.

use amigo_csv_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
#[derive(Default)]
pub struct CsvOptions {
    pub delimiter: Option<u32>,
    pub has_headers: Option<bool>,
    pub quote_char: Option<u32>,
    pub escape_char: Option<u32>,
    pub comment: Option<u32>,
    pub flexible: Option<bool>,
    pub trim_fields: Option<bool>,
}

fn into_core(o: Option<CsvOptions>) -> core::CsvOptions {
    let o = o.unwrap_or_default();
    core::CsvOptions {
        delimiter: o.delimiter,
        has_headers: o.has_headers,
        quote_char: o.quote_char,
        escape_char: o.escape_char,
        comment: o.comment,
        flexible: o.flexible,
        trim_fields: o.trim_fields,
    }
}

#[napi]
pub fn parse(input: Buffer, options: Option<CsvOptions>) -> Result<Vec<Vec<String>>> {
    core::parse(input.as_ref(), &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "parseWithHeaders")]
pub fn parse_with_headers(
    input: Buffer,
    options: Option<CsvOptions>,
) -> Result<Vec<HashMap<String, String>>> {
    core::parse_with_headers(input.as_ref(), &into_core(options)).map_err(Error::from_reason)
}

#[napi]
pub fn stringify(rows: Vec<Vec<String>>, options: Option<CsvOptions>) -> Result<String> {
    core::stringify(rows, &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "stringifyObjects")]
pub fn stringify_objects(
    rows: Vec<HashMap<String, String>>,
    columns: Option<Vec<String>>,
    options: Option<CsvOptions>,
) -> Result<String> {
    core::stringify_objects(rows, columns, &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "countRows")]
pub fn count_rows(input: Buffer, options: Option<CsvOptions>) -> Result<u32> {
    core::count_rows(input.as_ref(), &into_core(options)).map_err(Error::from_reason)
}

#[napi(js_name = "parseToJson")]
pub fn parse_to_json(input: Buffer, options: Option<CsvOptions>) -> Result<String> {
    core::parse_to_json(input.as_ref(), &into_core(options)).map_err(Error::from_reason)
}
