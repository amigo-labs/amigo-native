use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn detects_english() {
    assert_eq!(
        amigo_language_detect_wasm::detect(
            "The quick brown fox jumps over the lazy dog",
            JsValue::UNDEFINED
        )
        .unwrap(),
        "eng"
    );
}

#[wasm_bindgen_test]
fn detects_german() {
    assert_eq!(
        amigo_language_detect_wasm::detect(
            "Der schnelle braune Fuchs springt über den faulen Hund",
            JsValue::UNDEFINED
        )
        .unwrap(),
        "deu"
    );
}

#[wasm_bindgen_test]
fn short_input_returns_und() {
    assert_eq!(
        amigo_language_detect_wasm::detect("hi", JsValue::UNDEFINED).unwrap(),
        "und"
    );
}

#[wasm_bindgen_test]
fn language_exists_recognises_common_codes() {
    assert!(amigo_language_detect_wasm::language_exists("eng"));
    assert!(!amigo_language_detect_wasm::language_exists("zzz"));
}
