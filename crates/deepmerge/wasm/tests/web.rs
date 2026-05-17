use wasm_bindgen::prelude::*;
use wasm_bindgen_test::*;

// Build a JS object via js-sys-style serialization. We use serde_json::json!
// to build values, then push them through serde-wasm-bindgen the same way
// the public API does.
fn jv(v: serde_json::Value) -> JsValue {
    serde_wasm_bindgen::to_value(&v).unwrap()
}

#[wasm_bindgen_test]
fn simple_merge() {
    let a = jv(serde_json::json!({"a": 1, "b": 2}));
    let b = jv(serde_json::json!({"b": 3, "c": 4}));
    let out = amigo_deepmerge_wasm::merge_json(a, b, JsValue::UNDEFINED).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(out).unwrap();
    assert_eq!(v, serde_json::json!({"a": 1, "b": 3, "c": 4}));
}

#[wasm_bindgen_test]
fn rejects_prototype_pollution() {
    let a = jv(serde_json::json!({"x": 1}));
    let b = jv(serde_json::json!({"__proto__": {"polluted": true}}));
    let out = amigo_deepmerge_wasm::merge_json(a, b, JsValue::UNDEFINED).unwrap();
    let v: serde_json::Value = serde_wasm_bindgen::from_value(out).unwrap();
    assert!(v.get("__proto__").is_none());
}
