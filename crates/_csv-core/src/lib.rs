//! Shared CSV parse/stringify logic via BurntSushi's `csv` crate.
//! Internal-only — wrapped by `crates/csv/` (napi) and
//! `crates/csv/wasm/` (WASM).

use csv::{ReaderBuilder, Trim, WriterBuilder};
use std::collections::HashMap;

#[derive(Default, Debug, Clone)]
pub struct CsvOptions {
    pub delimiter: Option<u32>,
    pub has_headers: Option<bool>,
    pub quote_char: Option<u32>,
    pub escape_char: Option<u32>,
    pub comment: Option<u32>,
    pub flexible: Option<bool>,
    pub trim_fields: Option<bool>,
}

/// Validates a single-byte option coming from JS (where it arrives as a
/// plain number). Values above 255 used to be truncated with `as u8`,
/// silently turning e.g. `{delimiter: 256}` into a NUL byte.
fn byte_opt(name: &str, value: Option<u32>) -> Result<Option<u8>, String> {
    match value {
        None => Ok(None),
        Some(v) => u8::try_from(v)
            .map(Some)
            .map_err(|_| format!("{name} must be a single byte (0-255), got {v}")),
    }
}

pub fn make_reader(opts: &CsvOptions) -> Result<ReaderBuilder, String> {
    let mut builder = ReaderBuilder::new();
    builder
        .delimiter(byte_opt("delimiter", opts.delimiter)?.unwrap_or(b','))
        .has_headers(opts.has_headers.unwrap_or(true))
        .flexible(opts.flexible.unwrap_or(false))
        .trim(if opts.trim_fields.unwrap_or(false) {
            Trim::All
        } else {
            Trim::None
        });
    if let Some(q) = byte_opt("quoteChar", opts.quote_char)? {
        builder.quote(q);
    }
    if let Some(e) = byte_opt("escapeChar", opts.escape_char)? {
        builder.escape(Some(e));
    }
    if let Some(c) = byte_opt("comment", opts.comment)? {
        builder.comment(Some(c));
    }
    Ok(builder)
}

fn make_writer(opts: &CsvOptions) -> Result<WriterBuilder, String> {
    let mut builder = WriterBuilder::new();
    builder.delimiter(byte_opt("delimiter", opts.delimiter)?.unwrap_or(b','));
    Ok(builder)
}

pub fn parse(input: &[u8], opts: &CsvOptions) -> Result<Vec<Vec<String>>, String> {
    let mut reader = make_reader(opts)?.from_reader(input);
    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| e.to_string())?;
        rows.push(record.iter().map(|s| s.to_string()).collect());
    }
    Ok(rows)
}

pub fn parse_with_headers(
    input: &[u8],
    opts: &CsvOptions,
) -> Result<Vec<HashMap<String, String>>, String> {
    let mut builder = make_reader(opts)?;
    builder.has_headers(true);
    let mut reader = builder.from_reader(input);

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| e.to_string())?;
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

pub fn stringify(rows: Vec<Vec<String>>, opts: &CsvOptions) -> Result<String, String> {
    let mut writer = make_writer(opts)?.from_writer(Vec::new());
    for row in rows {
        writer.write_record(&row).map_err(|e| e.to_string())?;
    }
    let bytes = writer.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub fn stringify_objects(
    rows: Vec<HashMap<String, String>>,
    columns: Option<Vec<String>>,
    opts: &CsvOptions,
) -> Result<String, String> {
    let mut writer = make_writer(opts)?.from_writer(Vec::new());

    let cols = columns.unwrap_or_else(|| {
        if let Some(first) = rows.first() {
            let mut keys: Vec<String> = first.keys().cloned().collect();
            keys.sort();
            keys
        } else {
            Vec::new()
        }
    });

    writer.write_record(&cols).map_err(|e| e.to_string())?;
    for row in &rows {
        let values: Vec<&str> = cols.iter().map(|c| row.get(c).map_or("", |v| v)).collect();
        writer.write_record(&values).map_err(|e| e.to_string())?;
    }
    let bytes = writer.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub fn count_rows(input: &[u8], opts: &CsvOptions) -> Result<u32, String> {
    let mut reader = make_reader(opts)?.from_reader(input);
    let mut count = 0u32;
    for result in reader.records() {
        result.map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

pub fn parse_to_json(input: &[u8], opts: &CsvOptions) -> Result<String, String> {
    let mut reader = make_reader(opts)?.from_reader(input);
    let mut out = String::from("[");
    let mut first_row = true;
    for result in reader.records() {
        let record = result.map_err(|e| e.to_string())?;
        if !first_row {
            out.push(',');
        }
        first_row = false;
        out.push('[');
        let mut first_field = true;
        for field in record.iter() {
            if !first_field {
                out.push(',');
            }
            first_field = false;
            out.push('"');
            for ch in field.chars() {
                match ch {
                    '"' => out.push_str("\\\""),
                    '\\' => out.push_str("\\\\"),
                    '\n' => out.push_str("\\n"),
                    '\r' => out.push_str("\\r"),
                    '\t' => out.push_str("\\t"),
                    c => out.push(c),
                }
            }
            out.push('"');
        }
        out.push(']');
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts_with(f: impl FnOnce(&mut CsvOptions)) -> CsvOptions {
        let mut o = CsvOptions::default();
        f(&mut o);
        o
    }

    #[test]
    fn parse_with_custom_delimiter() {
        let opts = opts_with(|o| {
            o.delimiter = Some(u32::from(b';'));
            o.has_headers = Some(false);
        });
        let rows = parse(b"a;b\nc;d\n", &opts).unwrap();
        assert_eq!(rows, vec![vec!["a", "b"], vec!["c", "d"]]);
    }

    #[test]
    fn parse_rejects_out_of_range_delimiter() {
        let opts = opts_with(|o| o.delimiter = Some(256));
        let err = parse(b"a,b\n", &opts).unwrap_err();
        assert_eq!(err, "delimiter must be a single byte (0-255), got 256");
    }

    #[test]
    fn parse_rejects_out_of_range_quote_escape_comment() {
        for (name, set) in [
            (
                "quoteChar",
                &(|o: &mut CsvOptions| o.quote_char = Some(300)) as &dyn Fn(&mut _),
            ),
            ("escapeChar", &|o: &mut CsvOptions| {
                o.escape_char = Some(1000)
            }),
            ("comment", &|o: &mut CsvOptions| o.comment = Some(u32::MAX)),
        ] {
            let opts = opts_with(|o| set(o));
            let err = parse(b"a,b\n", &opts).unwrap_err();
            assert!(
                err.starts_with(&format!("{name} must be a single byte")),
                "unexpected error for {name}: {err}"
            );
        }
    }

    #[test]
    fn stringify_rejects_out_of_range_delimiter() {
        let opts = opts_with(|o| o.delimiter = Some(256));
        let err = stringify(vec![vec!["a".to_string()]], &opts).unwrap_err();
        assert_eq!(err, "delimiter must be a single byte (0-255), got 256");
        let err = stringify_objects(Vec::new(), None, &opts).unwrap_err();
        assert_eq!(err, "delimiter must be a single byte (0-255), got 256");
    }
}
