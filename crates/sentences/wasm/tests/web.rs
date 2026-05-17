use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn splits_simple() {
    let out =
        amigo_sentences_wasm::split("Hello world. How are you? I am fine.", JsValue::UNDEFINED)
            .unwrap();
    assert_eq!(out.len(), 3);
}

#[wasm_bindgen_test]
fn handles_abbreviation() {
    let out =
        amigo_sentences_wasm::split("Dr. Smith arrived. He waved.", JsValue::UNDEFINED).unwrap();
    assert_eq!(out.len(), 2);
}
