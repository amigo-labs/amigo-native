use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn utf8_roundtrip() {
    let enc = amigo_encoding_wasm::encode("hëllo 世界", "utf-8").unwrap();
    let dec = amigo_encoding_wasm::decode(&enc, "utf-8").unwrap();
    assert_eq!(dec, "hëllo 世界");
}

#[wasm_bindgen_test]
fn windows_1252_roundtrip() {
    let enc = amigo_encoding_wasm::encode("café", "windows-1252").unwrap();
    let dec = amigo_encoding_wasm::decode(&enc, "windows-1252").unwrap();
    assert_eq!(dec, "café");
}

#[wasm_bindgen_test]
fn unknown_encoding_errors() {
    assert!(amigo_encoding_wasm::encode("x", "totally-not-real").is_err());
}
