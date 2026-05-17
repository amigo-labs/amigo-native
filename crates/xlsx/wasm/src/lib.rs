use amigo_xlsx_core as core;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct CellValueJs {
    kind: String,
    text: Option<String>,
    number: Option<f64>,
    bool_value: Option<bool>,
}

impl From<core::CellValue> for CellValueJs {
    fn from(c: core::CellValue) -> Self {
        Self {
            kind: c.kind,
            text: c.text,
            number: c.number,
            bool_value: c.bool_value,
        }
    }
}

#[derive(Serialize)]
struct SheetJs {
    name: String,
    rows: Vec<Vec<CellValueJs>>,
}

#[derive(Serialize)]
struct WorkbookJs {
    sheets: Vec<SheetJs>,
}

#[derive(Deserialize)]
struct WriteCellJs {
    kind: String,
    text: Option<String>,
    number: Option<f64>,
    bool_value: Option<bool>,
}

impl From<WriteCellJs> for core::WriteCell {
    fn from(c: WriteCellJs) -> Self {
        Self {
            kind: c.kind,
            text: c.text,
            number: c.number,
            bool_value: c.bool_value,
        }
    }
}

#[derive(Deserialize)]
struct WriteSheetJs {
    name: String,
    rows: Vec<Vec<WriteCellJs>>,
}

#[wasm_bindgen(js_name = "readWorkbook")]
pub fn read_workbook(buf: &[u8]) -> Result<JsValue, JsError> {
    let wb = core::read_workbook(buf).map_err(|e| JsError::new(&e))?;
    let js = WorkbookJs {
        sheets: wb
            .sheets
            .into_iter()
            .map(|s| SheetJs {
                name: s.name,
                rows: s
                    .rows
                    .into_iter()
                    .map(|r| r.into_iter().map(Into::into).collect())
                    .collect(),
            })
            .collect(),
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "readSheet")]
pub fn read_sheet(buf: &[u8], sheet_name: &str) -> Result<JsValue, JsError> {
    let s = core::read_sheet(buf, sheet_name).map_err(|e| JsError::new(&e))?;
    let js = SheetJs {
        name: s.name,
        rows: s
            .rows
            .into_iter()
            .map(|r| r.into_iter().map(Into::into).collect())
            .collect(),
    };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "readSheetAsObjects")]
pub fn read_sheet_as_objects(buf: &[u8], sheet_name: &str) -> Result<JsValue, JsError> {
    let objects = core::read_sheet_as_objects(buf, sheet_name).map_err(|e| JsError::new(&e))?;
    let js: Vec<HashMap<String, CellValueJs>> = objects
        .into_iter()
        .map(|m| m.into_iter().map(|(k, v)| (k, v.into())).collect())
        .collect();
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "writeWorkbook")]
pub fn write_workbook(sheets: JsValue) -> Result<Vec<u8>, JsError> {
    let ss: Vec<WriteSheetJs> =
        serde_wasm_bindgen::from_value(sheets).map_err(|e| JsError::new(&e.to_string()))?;
    let core_sheets: Vec<core::WriteSheet> = ss
        .into_iter()
        .map(|s| core::WriteSheet {
            name: s.name,
            rows: s
                .rows
                .into_iter()
                .map(|r| r.into_iter().map(Into::into).collect())
                .collect(),
        })
        .collect();
    core::write_workbook(core_sheets).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "writeSheetFromObjects")]
pub fn write_sheet_from_objects(sheet_name: &str, rows: JsValue) -> Result<Vec<u8>, JsError> {
    let rs: Vec<HashMap<String, WriteCellJs>> =
        serde_wasm_bindgen::from_value(rows).map_err(|e| JsError::new(&e.to_string()))?;
    let core_rows: Vec<HashMap<String, core::WriteCell>> = rs
        .into_iter()
        .map(|m| m.into_iter().map(|(k, v)| (k, v.into())).collect())
        .collect();
    core::write_sheet_from_objects(sheet_name, core_rows).map_err(|e| JsError::new(&e))
}
