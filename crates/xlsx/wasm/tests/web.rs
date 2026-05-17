use wasm_bindgen_test::*;

// Note: `write_workbook` is currently unavailable in the WASM build —
// `rust_xlsxwriter` calls `std::time::SystemTime::now()` for the file's
// modified-date metadata, which panics on `wasm32-unknown-unknown`
// ("time not implemented on this platform"). Read-side functions
// (`readWorkbook` / `readSheet` / `readSheetAsObjects`) work fine.
// Tracked as a documented divergence in __conformance__/divergences.md.

#[wasm_bindgen_test]
fn read_empty_buffer_errors() {
    let r = amigo_xlsx_wasm::read_workbook(b"");
    assert!(r.is_err());
}
