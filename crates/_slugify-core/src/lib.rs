//! Shared slugification logic used by @amigo-labs/slugify (napi and
//! WASM bindings). Internal-only crate (not published to npm).
//!
//! Deliberately minimal: no FFI types, no error reporting, no I/O.
//! The public npm wrapper (`crates/slugify/`) owns the FFI surface
//! for both the napi-rs binary and the wasm-bindgen browser build.

use deunicode::deunicode;
use unicode_normalization::UnicodeNormalization;

pub fn slugify(input: &str, separator: &str) -> String {
    let normalized = input.nfkd().collect::<String>();
    let ascii = deunicode(&normalized);

    ascii
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join(separator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_ascii() {
        assert_eq!(slugify("Hello World", "-"), "hello-world");
    }

    #[test]
    fn test_german_umlauts() {
        assert_eq!(slugify("Ärger über Übel", "-"), "arger-uber-ubel");
    }

    #[test]
    fn test_special_chars() {
        assert_eq!(slugify("foo@bar#baz!", "-"), "foo-bar-baz");
    }

    #[test]
    fn test_multiple_spaces() {
        assert_eq!(slugify("a   b   c", "-"), "a-b-c");
    }

    #[test]
    fn test_leading_trailing() {
        assert_eq!(slugify("  hello  ", "-"), "hello");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(slugify("", "-"), "");
    }

    #[test]
    fn test_numbers() {
        assert_eq!(slugify("ES2024 rocks", "-"), "es2024-rocks");
    }

    #[test]
    fn test_custom_separator() {
        assert_eq!(slugify("Hello World", "_"), "hello_world");
    }
}
