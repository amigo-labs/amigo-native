use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn test_finds_url() {
    assert!(amigo_linkify_it_wasm::test("Visit https://example.com", JsValue::UNDEFINED).unwrap());
}

#[wasm_bindgen_test]
fn test_no_match() {
    assert!(!amigo_linkify_it_wasm::test("nothing here", JsValue::UNDEFINED).unwrap());
}

#[wasm_bindgen_test]
fn match_offsets_3xu32_per_match() {
    let buf =
        amigo_linkify_it_wasm::match_offsets("Visit https://x.com", JsValue::UNDEFINED).unwrap();
    assert_eq!(buf.len(), 12);
}
