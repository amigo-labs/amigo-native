//! Shared logic for @amigo-labs/{{NAME}} — the single source of truth used
//! by both the napi binding (`crates/{{NAME}}/`) and the WASM binding
//! (`crates/{{NAME}}/wasm/`). No FFI types, no napi/wasm-bindgen attributes.

pub fn hello() -> String {
    "Hello from {{NAME}}!".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_works() {
        assert_eq!(hello(), "Hello from {{NAME}}!");
    }
}
