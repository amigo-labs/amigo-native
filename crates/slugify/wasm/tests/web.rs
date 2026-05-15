use wasm_bindgen_test::*;

// Default runner is Node; flip to browser in CI by overriding
// WASM_BINDGEN_TEST_TIMEOUT and invoking with `wasm-pack test --headless --chrome`.

#[wasm_bindgen_test]
fn basic_ascii() {
    assert_eq!(amigo_slugify_wasm::slugify("Hello World"), "hello-world");
}

#[wasm_bindgen_test]
fn german_umlauts() {
    assert_eq!(
        amigo_slugify_wasm::slugify("Ärger über Übel"),
        "arger-uber-ubel"
    );
}

#[wasm_bindgen_test]
fn custom_separator() {
    assert_eq!(
        amigo_slugify_wasm::slugify_with_separator("Hello World", "_"),
        "hello_world"
    );
}
