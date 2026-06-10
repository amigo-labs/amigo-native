use wasm_bindgen_test::*;

// Default runner is Node (`pnpm test:wasm` → `wasm-pack test --node`).
// Keep these in parity with crates/{{NAME}}/__test__/.

#[wasm_bindgen_test]
fn hello_works() {
    assert_eq!(amigo_{{NAME_UNDERSCORE}}_wasm::hello(), "Hello from {{NAME}}!");
}
