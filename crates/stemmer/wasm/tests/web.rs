use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn stem_once_english() {
    assert_eq!(
        amigo_stemmer_wasm::stem_once("english", "running").unwrap(),
        "run"
    );
}

#[wasm_bindgen_test]
fn stemmer_tokenize_and_stem_basic() {
    let s = amigo_stemmer_wasm::Stemmer::new("english".to_string()).unwrap();
    let out = s
        .tokenize_and_stem("running runs ran", JsValue::UNDEFINED)
        .unwrap();
    assert!(out.contains(&"run".to_string()));
}

#[wasm_bindgen_test]
fn unknown_language_errors() {
    assert!(amigo_stemmer_wasm::Stemmer::new("klingon".to_string()).is_err());
}
