use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hello() -> String {
    amigo_{{NAME_UNDERSCORE}}_core::hello()
}
