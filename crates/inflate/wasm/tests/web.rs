use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn deflate_inflate_roundtrip() {
    let enc = amigo_inflate_wasm::deflate(b"hello world", JsValue::UNDEFINED).unwrap();
    let dec = amigo_inflate_wasm::inflate(&enc, JsValue::UNDEFINED).unwrap();
    assert_eq!(dec, b"hello world");
}

#[wasm_bindgen_test]
fn gzip_ungzip_roundtrip() {
    let enc = amigo_inflate_wasm::gzip(b"some text", JsValue::UNDEFINED).unwrap();
    let dec = amigo_inflate_wasm::ungzip(&enc, JsValue::UNDEFINED).unwrap();
    assert_eq!(dec, b"some text");
}
