use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn compile_simple_typst() {
    let r = amigo_typst_wasm::compile("= Hello\n\nworld".to_string(), JsValue::UNDEFINED);
    // Compiling a minimal Typst doc with bundled fonts should succeed
    // and produce a non-trivial PDF byte string.
    assert!(r.is_ok(), "compile failed: {:?}", r.err());
}
