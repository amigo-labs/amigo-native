use serde::Serialize;
use wasm_bindgen_test::*;

// Dedicated struct types: serde_json::Value via serde_wasm_bindgen does not
// round-trip to a plain JS object (it produces Map/Array), which the
// deserializer on the Rust side treats as missing fields.
#[derive(Serialize)]
struct Node {
    id: String,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
struct Edge {
    source: String,
    target: String,
}

#[derive(Serialize)]
struct Spec {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

#[wasm_bindgen_test]
fn single_node_layout() {
    let spec = Spec {
        nodes: vec![Node {
            id: "a".into(),
            width: 100.0,
            height: 40.0,
        }],
        edges: vec![],
    };
    let spec_js = serde_wasm_bindgen::to_value(&spec).unwrap();
    let result = amigo_graph_layout_wasm::layout(spec_js).unwrap();
    assert!(!result.is_null());
}

#[wasm_bindgen_test]
fn chain_layout_runs() {
    let spec = Spec {
        nodes: vec![
            Node {
                id: "a".into(),
                width: 50.0,
                height: 30.0,
            },
            Node {
                id: "b".into(),
                width: 50.0,
                height: 30.0,
            },
        ],
        edges: vec![Edge {
            source: "a".into(),
            target: "b".into(),
        }],
    };
    let spec_js = serde_wasm_bindgen::to_value(&spec).unwrap();
    let result = amigo_graph_layout_wasm::layout(spec_js).unwrap();
    assert!(!result.is_null());
}
