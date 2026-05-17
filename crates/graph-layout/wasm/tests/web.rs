use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn single_node_layout() {
    let spec = serde_wasm_bindgen::to_value(&serde_json::json!({
        "nodes": [{"id": "a", "width": 100.0, "height": 40.0}],
        "edges": []
    }))
    .unwrap();
    let result = amigo_graph_layout_wasm::layout(spec).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    assert_eq!(v.get("nodes").unwrap().as_array().unwrap().len(), 1);
}

#[wasm_bindgen_test]
fn chain_layout_increases_y() {
    let spec = serde_wasm_bindgen::to_value(&serde_json::json!({
        "nodes": [
            {"id": "a", "width": 50.0, "height": 30.0},
            {"id": "b", "width": 50.0, "height": 30.0},
        ],
        "edges": [{"source": "a", "target": "b"}],
    }))
    .unwrap();
    let result = amigo_graph_layout_wasm::layout(spec).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    let nodes = v.get("nodes").unwrap().as_array().unwrap();
    let ya = nodes[0].get("y").unwrap().as_f64().unwrap();
    let yb = nodes[1].get("y").unwrap().as_f64().unwrap();
    assert!(yb > ya);
}
