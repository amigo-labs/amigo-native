//! XLSX read + write — thin napi wrapper around `amigo-xlsx-core`.

use amigo_xlsx_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;

#[napi(object)]
pub struct CellValue {
    pub kind: String,
    pub text: Option<String>,
    pub number: Option<f64>,
    pub bool_value: Option<bool>,
}

fn from_core_cell(c: core::CellValue) -> CellValue {
    CellValue {
        kind: c.kind,
        text: c.text,
        number: c.number,
        bool_value: c.bool_value,
    }
}

#[napi(object)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<CellValue>>,
}

#[napi(object)]
pub struct Workbook2 {
    pub sheets: Vec<Sheet>,
}

#[napi(js_name = "readWorkbook")]
pub fn read_workbook(buf: Buffer) -> Result<Workbook2> {
    let wb = core::read_workbook(buf.as_ref()).map_err(Error::from_reason)?;
    Ok(Workbook2 {
        sheets: wb
            .sheets
            .into_iter()
            .map(|s| Sheet {
                name: s.name,
                rows: s
                    .rows
                    .into_iter()
                    .map(|r| r.into_iter().map(from_core_cell).collect())
                    .collect(),
            })
            .collect(),
    })
}

#[napi(js_name = "readSheet")]
pub fn read_sheet(buf: Buffer, sheet_name: String) -> Result<Sheet> {
    let s = core::read_sheet(buf.as_ref(), &sheet_name).map_err(Error::from_reason)?;
    Ok(Sheet {
        name: s.name,
        rows: s
            .rows
            .into_iter()
            .map(|r| r.into_iter().map(from_core_cell).collect())
            .collect(),
    })
}

#[napi(js_name = "readSheetAsObjects")]
pub fn read_sheet_as_objects(
    buf: Buffer,
    sheet_name: String,
) -> Result<Vec<HashMap<String, CellValue>>> {
    let objects =
        core::read_sheet_as_objects(buf.as_ref(), &sheet_name).map_err(Error::from_reason)?;
    Ok(objects
        .into_iter()
        .map(|m| m.into_iter().map(|(k, v)| (k, from_core_cell(v))).collect())
        .collect())
}

#[napi(object)]
#[derive(Clone)]
pub struct WriteCell {
    pub kind: String,
    pub text: Option<String>,
    pub number: Option<f64>,
    pub bool_value: Option<bool>,
}

fn into_core_write_cell(c: WriteCell) -> core::WriteCell {
    core::WriteCell {
        kind: c.kind,
        text: c.text,
        number: c.number,
        bool_value: c.bool_value,
    }
}

#[napi(object)]
#[derive(Clone)]
pub struct WriteSheet {
    pub name: String,
    pub rows: Vec<Vec<WriteCell>>,
}

#[napi(js_name = "writeWorkbook")]
pub fn write_workbook(sheets: Vec<WriteSheet>) -> Result<Buffer> {
    let core_sheets: Vec<core::WriteSheet> = sheets
        .into_iter()
        .map(|s| core::WriteSheet {
            name: s.name,
            rows: s
                .rows
                .into_iter()
                .map(|r| r.into_iter().map(into_core_write_cell).collect())
                .collect(),
        })
        .collect();
    core::write_workbook(core_sheets)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi(js_name = "writeSheetFromObjects")]
pub fn write_sheet_from_objects(
    sheet_name: String,
    rows: Vec<HashMap<String, WriteCell>>,
) -> Result<Buffer> {
    let core_rows: Vec<HashMap<String, core::WriteCell>> = rows
        .into_iter()
        .map(|m| {
            m.into_iter()
                .map(|(k, v)| (k, into_core_write_cell(v)))
                .collect()
        })
        .collect();
    core::write_sheet_from_objects(&sheet_name, core_rows)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}
