use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn slugify(input: &str) -> String {
    amigo_slugify_core::slugify(input, "-")
}

#[wasm_bindgen(js_name = "slugifyWithSeparator")]
pub fn slugify_with_separator(input: &str, separator: &str) -> String {
    amigo_slugify_core::slugify(input, separator)
}
