use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn strips_comments_by_default() {
    let r = amigo_svgo_wasm::optimize(
        "<svg xmlns=\"http://www.w3.org/2000/svg\"><!-- comment --><rect width=\"10\" height=\"10\"/></svg>",
        JsValue::UNDEFINED,
    )
    .unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(r).unwrap();
    let data = v.get("data").unwrap().as_str().unwrap();
    assert!(!data.contains("<!--"));
}
