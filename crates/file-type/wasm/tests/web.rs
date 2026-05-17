use wasm_bindgen_test::*;

const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
];

#[wasm_bindgen_test]
fn detects_png() {
    let r = amigo_file_type_wasm::file_type_from_buffer_sync(PNG).unwrap();
    assert!(!r.is_null());
}

#[wasm_bindgen_test]
fn rejects_text() {
    let r = amigo_file_type_wasm::file_type_from_buffer_sync(b"plain text").unwrap();
    assert!(r.is_null());
}
