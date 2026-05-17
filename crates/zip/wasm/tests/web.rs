use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn write_then_read_roundtrip() {
    let mut w = amigo_zip_wasm::ZipWriter::new();
    w.add("hello.txt", b"hi", JsValue::UNDEFINED).unwrap();
    let zip = w.finalize().unwrap();
    let r = amigo_zip_wasm::ZipReader::new(&zip);
    let read = r.read("hello.txt").unwrap();
    assert_eq!(read, b"hi");
}
