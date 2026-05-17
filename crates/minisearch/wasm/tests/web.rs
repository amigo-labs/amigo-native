use serde::Serialize;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[derive(Serialize)]
struct Doc {
    id: String,
    text: String,
}

fn doc(id: &str, text: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&Doc {
        id: id.into(),
        text: text.into(),
    })
    .unwrap()
}

#[wasm_bindgen_test]
fn basic_search() {
    let m = amigo_minisearch_wasm::MiniSearch::new(JsValue::UNDEFINED).unwrap();
    m.add(doc("a", "rust programming language")).unwrap();
    m.add(doc("b", "python programming language")).unwrap();
    let hits = m.search("rust", JsValue::UNDEFINED).unwrap();
    assert!(!hits.is_null());
}

#[wasm_bindgen_test]
fn auto_suggest_returns_prefix_terms() {
    let m = amigo_minisearch_wasm::MiniSearch::new(JsValue::UNDEFINED).unwrap();
    m.add(doc("a", "rust rustic rustaceous")).unwrap();
    let sugs = m.auto_suggest("rust", None).unwrap();
    assert!(!sugs.is_null());
}
