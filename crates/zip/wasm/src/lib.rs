//! WASM bindings for zip. Only the buffer-source variant ships — WASM
//! has no `std::fs`, so `fromPath` doesn't exist in the browser build.

use amigo_zip_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct ZipEntryInfoJs {
    name: String,
    size: u64,
    compressed_size: u64,
    is_dir: bool,
    compression: String,
}

#[derive(Serialize)]
struct ZipEntryDataJs {
    name: String,
    data: Vec<u8>,
}

#[derive(Default, Deserialize)]
struct AddOptionsJs {
    compression: Option<String>,
    level: Option<i32>,
}

#[wasm_bindgen]
pub struct ZipReader {
    bytes: Vec<u8>,
}

#[wasm_bindgen]
impl ZipReader {
    #[wasm_bindgen(constructor)]
    pub fn new(buffer: &[u8]) -> Self {
        Self {
            bytes: buffer.to_vec(),
        }
    }

    #[wasm_bindgen]
    pub fn entries(&self) -> Result<JsValue, JsError> {
        let entries = core::entries_from_buffer(&self.bytes).map_err(|e| JsError::new(&e))?;
        let js: Vec<ZipEntryInfoJs> = entries
            .into_iter()
            .map(|e| ZipEntryInfoJs {
                name: e.name,
                size: e.size,
                compressed_size: e.compressed_size,
                is_dir: e.is_dir,
                compression: e.compression,
            })
            .collect();
        serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn read(&self, name: &str) -> Result<Vec<u8>, JsError> {
        core::read_entry_from_buffer(&self.bytes, name).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = "extractAll")]
    pub fn extract_all(&self) -> Result<JsValue, JsError> {
        let entries = core::extract_all_from_buffer(&self.bytes).map_err(|e| JsError::new(&e))?;
        let js: Vec<ZipEntryDataJs> = entries
            .into_iter()
            .map(|e| ZipEntryDataJs {
                name: e.name,
                data: e.data,
            })
            .collect();
        serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct ZipWriter {
    inner: core::Writer,
}

#[wasm_bindgen]
impl ZipWriter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: core::Writer::new(),
        }
    }

    #[wasm_bindgen]
    pub fn add(&mut self, name: &str, data: &[u8], options: JsValue) -> Result<(), JsError> {
        let o: AddOptionsJs = if options.is_undefined() || options.is_null() {
            AddOptionsJs::default()
        } else {
            serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
        };
        self.inner
            .add(
                name,
                data,
                &core::AddOptions {
                    compression: o.compression,
                    level: o.level,
                },
            )
            .map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen]
    pub fn finalize(&mut self) -> Result<Vec<u8>, JsError> {
        self.inner.finalize().map_err(|e| JsError::new(&e))
    }
}

impl Default for ZipWriter {
    fn default() -> Self {
        Self::new()
    }
}
