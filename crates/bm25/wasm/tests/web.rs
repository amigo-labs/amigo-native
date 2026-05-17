use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn add_and_search() {
    let idx = amigo_bm25_wasm::Bm25Index::new(JsValue::UNDEFINED).unwrap();
    idx.add_doc("a".to_string(), "rust programming language".to_string());
    idx.add_doc("b".to_string(), "python programming language".to_string());
    let hits_js = idx.search("rust", JsValue::UNDEFINED).unwrap();
    let hits: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(hits_js).unwrap();
    assert!(!hits.is_empty());
    assert_eq!(hits[0].get("id").unwrap(), "a");
}

#[wasm_bindgen_test]
fn size_reports_count() {
    let idx = amigo_bm25_wasm::Bm25Index::new(JsValue::UNDEFINED).unwrap();
    idx.add_doc("a".to_string(), "x".to_string());
    idx.add_doc("b".to_string(), "y".to_string());
    assert_eq!(idx.size(), 2);
}
