use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn split_text_chars_default() {
    let chunks =
        amigo_text_splitters_wasm::split_text("a b c d e f g h i j", JsValue::UNDEFINED).unwrap();
    assert!(!chunks.is_empty());
}

#[wasm_bindgen_test]
fn count_chars_basic() {
    assert_eq!(amigo_text_splitters_wasm::count_chars("hëllo"), 5);
}

#[wasm_bindgen_test]
fn count_tokens_errors_without_tiktoken() {
    let r = amigo_text_splitters_wasm::count_tokens("hello", None);
    assert!(r.is_err());
}
