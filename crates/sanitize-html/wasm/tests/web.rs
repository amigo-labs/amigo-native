use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn drops_script_tags() {
    let out = amigo_sanitize_html_wasm::sanitize(
        Some("<p>ok</p><script>alert(1)</script>".to_string()),
        JsValue::UNDEFINED,
    )
    .unwrap();
    assert!(out.contains("<p>ok</p>"));
    assert!(!out.contains("<script>"));
}

#[wasm_bindgen_test]
fn null_input_returns_empty() {
    let out = amigo_sanitize_html_wasm::sanitize(None, JsValue::UNDEFINED).unwrap();
    assert_eq!(out, "");
}

#[wasm_bindgen_test]
fn is_clean_detects_safe_input() {
    assert!(
        amigo_sanitize_html_wasm::is_clean(Some("<p>safe</p>".to_string()), JsValue::UNDEFINED)
            .unwrap()
    );
}
