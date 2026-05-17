use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn get_domain_basic() {
    assert_eq!(
        amigo_tldts_wasm::get_domain("https://www.example.com/path", JsValue::UNDEFINED).unwrap(),
        Some("example.com".to_string())
    );
}

#[wasm_bindgen_test]
fn get_hostname_basic() {
    assert_eq!(
        amigo_tldts_wasm::get_hostname("https://www.example.com:443/path"),
        Some("www.example.com".to_string())
    );
}
