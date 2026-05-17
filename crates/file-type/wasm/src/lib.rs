//! WASM bindings for file-type. The async `fileTypeFromBuffer` variant
//! is dropped (no thread pool in WASM); only the sync entry ships.

use amigo_file_type_core as core;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct FileTypeResultJs {
    ext: String,
    mime: String,
}

#[wasm_bindgen(js_name = "fileTypeFromBufferSync")]
pub fn file_type_from_buffer_sync(buffer: &[u8]) -> Result<JsValue, JsError> {
    match core::classify(buffer) {
        Some(r) => {
            let js = FileTypeResultJs {
                ext: r.ext,
                mime: r.mime,
            };
            serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
        }
        None => Ok(JsValue::NULL),
    }
}
