use serde::Serialize;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

// serde_wasm_bindgen does not round-trip `serde_json::Value::Object` into a
// plain JS object by default (it produces a `Map` instead, which the
// deserializer side here treats as a struct without `id` fields). Use
// dedicated `#[derive(Serialize)]` structs in tests so the JS shape matches
// what the public API expects.
#[derive(Serialize)]
struct Node {
    id: String,
}

fn empty_array() -> JsValue {
    let v: Vec<u8> = Vec::new();
    serde_wasm_bindgen::to_value(&v).unwrap()
}

#[wasm_bindgen_test]
fn empty_graph_returns_empty_nodes() {
    let result =
        amigo_force_layout_wasm::simulate(empty_array(), empty_array(), JsValue::UNDEFINED)
            .unwrap();
    assert!(!result.is_null());
}

#[wasm_bindgen_test]
fn three_node_run_finishes() {
    let nodes = vec![
        Node { id: "a".into() },
        Node { id: "b".into() },
        Node { id: "c".into() },
    ];
    let nodes_js = serde_wasm_bindgen::to_value(&nodes).unwrap();
    let result =
        amigo_force_layout_wasm::simulate(nodes_js, empty_array(), JsValue::UNDEFINED).unwrap();
    assert!(!result.is_null());
}
