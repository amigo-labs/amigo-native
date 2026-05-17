use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn basic_p_to_paragraph() {
    let md = amigo_turndown_wasm::turndown("<p>hi</p>", JsValue::UNDEFINED).unwrap();
    assert!(md.contains("hi"));
}

#[wasm_bindgen_test]
fn em_uses_default_underscore() {
    let md = amigo_turndown_wasm::turndown("<em>x</em>", JsValue::UNDEFINED).unwrap();
    assert!(md.contains("_x_"));
}

#[wasm_bindgen_test]
fn h1_atx_default() {
    let md = amigo_turndown_wasm::turndown("<h1>Title</h1>", JsValue::UNDEFINED).unwrap();
    assert!(md.starts_with("# Title"));
}
