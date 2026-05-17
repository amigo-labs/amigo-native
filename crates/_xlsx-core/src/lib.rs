//! Shared XLSX read/write logic via `calamine` (read) + `rust_xlsxwriter`
//! (write). Internal-only. Both engines are pure-Rust, no C deps.

use calamine::{Data, Reader, Xlsx, open_workbook_from_rs};
use rust_xlsxwriter::Workbook;
use std::collections::HashMap;
use std::io::Cursor;

#[derive(Debug, Clone)]
pub struct CellValue {
    pub kind: String,
    pub text: Option<String>,
    pub number: Option<f64>,
    pub bool_value: Option<bool>,
}

impl CellValue {
    fn from_data(d: &Data) -> Self {
        match d {
            Data::String(s) => Self {
                kind: "string".into(),
                text: Some(s.clone()),
                number: None,
                bool_value: None,
            },
            Data::Float(n) => Self {
                kind: "number".into(),
                text: None,
                number: Some(*n),
                bool_value: None,
            },
            Data::Int(n) => Self {
                kind: "number".into(),
                text: None,
                number: Some(*n as f64),
                bool_value: None,
            },
            Data::Bool(b) => Self {
                kind: "bool".into(),
                text: None,
                number: None,
                bool_value: Some(*b),
            },
            Data::DateTime(dt) => Self {
                kind: "date".into(),
                text: Some(dt.as_f64().to_string()),
                number: Some(dt.as_f64()),
                bool_value: None,
            },
            Data::DateTimeIso(s) | Data::DurationIso(s) => Self {
                kind: "date".into(),
                text: Some(s.clone()),
                number: None,
                bool_value: None,
            },
            Data::Error(e) => Self {
                kind: "error".into(),
                text: Some(format!("{:?}", e)),
                number: None,
                bool_value: None,
            },
            Data::Empty => Self {
                kind: "empty".into(),
                text: None,
                number: None,
                bool_value: None,
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<CellValue>>,
}

#[derive(Debug, Clone)]
pub struct Workbook2 {
    pub sheets: Vec<Sheet>,
}

pub fn read_workbook(buf: &[u8]) -> Result<Workbook2, String> {
    let cursor = Cursor::new(buf.to_vec());
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|e| format!("xlsx open: {e}"))?;
    let sheet_names: Vec<String> = workbook.sheet_names().to_owned();
    let mut sheets = Vec::new();
    for name in sheet_names {
        let range = workbook
            .worksheet_range(&name)
            .map_err(|e| format!("sheet '{name}': {e}"))?;
        let rows: Vec<Vec<CellValue>> = range
            .rows()
            .map(|row| row.iter().map(CellValue::from_data).collect())
            .collect();
        sheets.push(Sheet { name, rows });
    }
    Ok(Workbook2 { sheets })
}

pub fn read_sheet(buf: &[u8], sheet_name: &str) -> Result<Sheet, String> {
    let cursor = Cursor::new(buf.to_vec());
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|e| format!("xlsx open: {e}"))?;
    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| format!("sheet '{sheet_name}': {e}"))?;
    let rows: Vec<Vec<CellValue>> = range
        .rows()
        .map(|row| row.iter().map(CellValue::from_data).collect())
        .collect();
    Ok(Sheet {
        name: sheet_name.to_string(),
        rows,
    })
}

pub fn read_sheet_as_objects(
    buf: &[u8],
    sheet_name: &str,
) -> Result<Vec<HashMap<String, CellValue>>, String> {
    let sheet = read_sheet(buf, sheet_name)?;
    let mut rows_iter = sheet.rows.into_iter();
    let headers: Vec<String> = match rows_iter.next() {
        Some(h) => h
            .into_iter()
            .map(|c| c.text.unwrap_or_else(|| "column".into()))
            .collect(),
        None => return Ok(Vec::new()),
    };
    let out: Vec<HashMap<String, CellValue>> = rows_iter
        .map(|row| {
            let mut obj = HashMap::new();
            for (i, cell) in row.into_iter().enumerate() {
                let key = headers.get(i).cloned().unwrap_or_else(|| format!("col{i}"));
                obj.insert(key, cell);
            }
            obj
        })
        .collect();
    Ok(out)
}

#[derive(Debug, Clone)]
pub struct WriteCell {
    pub kind: String,
    pub text: Option<String>,
    pub number: Option<f64>,
    pub bool_value: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct WriteSheet {
    pub name: String,
    pub rows: Vec<Vec<WriteCell>>,
}

pub fn write_workbook(sheets: Vec<WriteSheet>) -> Result<Vec<u8>, String> {
    let mut wb = Workbook::new();
    for sheet_spec in sheets {
        let ws = wb.add_worksheet();
        ws.set_name(&sheet_spec.name)
            .map_err(|e| format!("sheet name: {e}"))?;
        for (r, row) in sheet_spec.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                let row_u = r as u32;
                let col_u = c as u16;
                match cell.kind.as_str() {
                    "string" => {
                        ws.write_string(row_u, col_u, cell.text.clone().unwrap_or_default())
                            .map_err(|e| format!("write: {e}"))?;
                    }
                    "number" => {
                        ws.write_number(row_u, col_u, cell.number.unwrap_or(0.0))
                            .map_err(|e| format!("write: {e}"))?;
                    }
                    "bool" => {
                        ws.write_boolean(row_u, col_u, cell.bool_value.unwrap_or(false))
                            .map_err(|e| format!("write: {e}"))?;
                    }
                    _ => {}
                }
            }
        }
    }
    wb.save_to_buffer().map_err(|e| format!("save: {e}"))
}

pub fn write_sheet_from_objects(
    sheet_name: &str,
    rows: Vec<HashMap<String, WriteCell>>,
) -> Result<Vec<u8>, String> {
    if rows.is_empty() {
        return write_workbook(vec![WriteSheet {
            name: sheet_name.to_string(),
            rows: Vec::new(),
        }]);
    }

    let mut headers: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in &rows {
        for k in row.keys() {
            if seen.insert(k.clone()) {
                headers.push(k.clone());
            }
        }
    }

    let mut sheet_rows: Vec<Vec<WriteCell>> = Vec::with_capacity(rows.len() + 1);
    sheet_rows.push(
        headers
            .iter()
            .map(|h| WriteCell {
                kind: "string".into(),
                text: Some(h.clone()),
                number: None,
                bool_value: None,
            })
            .collect(),
    );
    for row in rows {
        let cells: Vec<WriteCell> = headers
            .iter()
            .map(|h| {
                row.get(h).cloned().unwrap_or(WriteCell {
                    kind: "empty".into(),
                    text: None,
                    number: None,
                    bool_value: None,
                })
            })
            .collect();
        sheet_rows.push(cells);
    }

    write_workbook(vec![WriteSheet {
        name: sheet_name.to_string(),
        rows: sheet_rows,
    }])
}
