use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn empty_graph_returns_empty_nodes() {
    let nodes = serde_wasm_bindgen::to_value::<Vec<serde_json::Value>>(&Vec::new()).unwrap();
    let edges = serde_wasm_bindgen::to_value::<Vec<serde_json::Value>>(&Vec::new()).unwrap();
    let result = amigo_force_layout_wasm::simulate(nodes, edges, JsValue::UNDEFINED).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    assert_eq!(v.get("nodes").unwrap().as_array().unwrap().len(), 0);
}

#[wasm_bindgen_test]
fn three_node_run_finishes() {
    let nodes = serde_wasm_bindgen::to_value(&serde_json::json!([
        {"id": "a"}, {"id": "b"}, {"id": "c"}
    ]))
    .unwrap();
    let edges = serde_wasm_bindgen::to_value::<Vec<serde_json::Value>>(&Vec::new()).unwrap();
    let result = amigo_force_layout_wasm::simulate(nodes, edges, JsValue::UNDEFINED).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    assert_eq!(v.get("nodes").unwrap().as_array().unwrap().len(), 3);
}
