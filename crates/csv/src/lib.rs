use csv::{ReaderBuilder, Trim, WriterBuilder};
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

fn make_reader(opts: &CsvOptions) -> ReaderBuilder {
    let mut builder = ReaderBuilder::new();
    builder
        .delimiter(opts.delimiter.unwrap_or(44) as u8)
        .has_headers(opts.has_headers.unwrap_or(true))
        .flexible(opts.flexible.unwrap_or(false))
        .trim(if opts.trim_fields.unwrap_or(false) {
            Trim::All
        } else {
            Trim::None
        });
    if let Some(q) = opts.quote_char {
        builder.quote(q as u8);
    }
    if let Some(e) = opts.escape_char {
        builder.escape(Some(e as u8));
    }
    if let Some(c) = opts.comment {
        builder.comment(Some(c as u8));
    }
    builder
}

#[napi]
pub fn parse(input: Buffer, options: Option<CsvOptions>) -> Result<Vec<Vec<String>>> {
    let opts = options.unwrap_or_default();
    let mut reader = make_reader(&opts).from_reader(input.as_ref());

    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| Error::from_reason(e.to_string()))?;
        rows.push(record.iter().map(|s| s.to_string()).collect());
    }
    Ok(rows)
}

#[napi(js_name = "parseWithHeaders")]
pub fn parse_with_headers(
    input: Buffer,
    options: Option<CsvOptions>,
) -> Result<Vec<HashMap<String, String>>> {
    let opts = options.unwrap_or_default();
    let mut builder = make_reader(&opts);
    builder.has_headers(true);
    let mut reader = builder.from_reader(input.as_ref());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| Error::from_reason(e.to_string()))?;
        let mut map = HashMap::new();
        for (i, field) in record.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header.clone(), field.to_string());
            }
        }
        rows.push(map);
    }
    Ok(rows)
}

#[napi]
pub fn stringify(rows: Vec<Vec<String>>, options: Option<CsvOptions>) -> Result<String> {
    let opts = options.unwrap_or_default();
    let mut writer = WriterBuilder::new()
        .delimiter(opts.delimiter.unwrap_or(44) as u8)
        .from_writer(Vec::new());

    for row in rows {
        writer
            .write_record(&row)
            .map_err(|e| Error::from_reason(e.to_string()))?;
    }

    let bytes = writer
        .into_inner()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| Error::from_reason(e.to_string()))
}

#[napi(js_name = "stringifyObjects")]
pub fn stringify_objects(
    rows: Vec<HashMap<String, String>>,
    columns: Option<Vec<String>>,
    options: Option<CsvOptions>,
) -> Result<String> {
    let opts = options.unwrap_or_default();
    let mut writer = WriterBuilder::new()
        .delimiter(opts.delimiter.unwrap_or(44) as u8)
        .from_writer(Vec::new());

    let cols = columns.unwrap_or_else(|| {
        if let Some(first) = rows.first() {
            let mut keys: Vec<String> = first.keys().cloned().collect();
            keys.sort();
            keys
        } else {
            Vec::new()
        }
    });

    writer
        .write_record(&cols)
        .map_err(|e| Error::from_reason(e.to_string()))?;

    for row in &rows {
        let values: Vec<&str> = cols.iter().map(|c| row.get(c).map_or("", |v| v)).collect();
        writer
            .write_record(&values)
            .map_err(|e| Error::from_reason(e.to_string()))?;
    }

    let bytes = writer
        .into_inner()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| Error::from_reason(e.to_string()))
}
