use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

fn doc_json(id: &str, text: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&serde_json::json!({"id": id, "text": text})).unwrap()
}

#[wasm_bindgen_test]
fn basic_search() {
    let m = amigo_minisearch_wasm::MiniSearch::new(JsValue::UNDEFINED).unwrap();
    m.add(doc_json("a", "rust programming language")).unwrap();
    m.add(doc_json("b", "python programming language")).unwrap();
    let hits = m.search("rust", JsValue::UNDEFINED).unwrap();
    let v: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(hits).unwrap();
    assert!(!v.is_empty());
    assert_eq!(v[0].get("id").unwrap(), "a");
}

#[wasm_bindgen_test]
fn auto_suggest_returns_prefix_terms() {
    let m = amigo_minisearch_wasm::MiniSearch::new(JsValue::UNDEFINED).unwrap();
    m.add(doc_json("a", "rust rustic rustaceous")).unwrap();
    let sugs = m.auto_suggest("rust", None).unwrap();
    let v: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(sugs).unwrap();
    assert!(v.iter().any(|s| s.get("suggestion").unwrap() == "rust"));
}
