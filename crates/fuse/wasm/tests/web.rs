use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn basic_search() {
    let records = vec![
        r#""apple""#.to_string(),
        r#""banana""#.to_string(),
        r#""cherry""#.to_string(),
    ];
    let f = amigo_fuse_wasm::Fuse::new(records, JsValue::UNDEFINED).unwrap();
    let results = f.search("ban", None).unwrap();
    assert!(!results.is_null());
}

#[wasm_bindgen_test]
fn empty_query_returns_empty() {
    let records = vec![r#""apple""#.to_string()];
    let f = amigo_fuse_wasm::Fuse::new(records, JsValue::UNDEFINED).unwrap();
    let results = f.search("", None).unwrap();
    let v: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(results).unwrap();
    assert_eq!(v.len(), 0);
}

#[wasm_bindgen_test]
fn size_reports_record_count() {
    let f = amigo_fuse_wasm::Fuse::new(
        vec![r#""a""#.to_string(), r#""b""#.to_string()],
        JsValue::UNDEFINED,
    )
    .unwrap();
    assert_eq!(f.size(), 2);
}
