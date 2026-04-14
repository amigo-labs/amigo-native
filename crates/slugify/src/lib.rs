use napi_derive::napi;

#[napi]
pub fn slugify(input: String) -> String {
    slugify_impl(&input, "-")
}

#[napi(js_name = "slugifyWithSeparator")]
pub fn slugify_with_separator(input: String, separator: String) -> String {
    slugify_impl(&input, &separator)
}

fn slugify_impl(input: &str, separator: &str) -> String {
    use deunicode::deunicode;
    use unicode_normalization::UnicodeNormalization;

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
        assert_eq!(slugify_impl("Hello World", "-"), "hello-world");
    }

    #[test]
    fn test_german_umlauts() {
        assert_eq!(slugify_impl("Ärger über Übel", "-"), "arger-uber-ubel");
    }

    #[test]
    fn test_special_chars() {
        assert_eq!(slugify_impl("foo@bar#baz!", "-"), "foo-bar-baz");
    }

    #[test]
    fn test_multiple_spaces() {
        assert_eq!(slugify_impl("a   b   c", "-"), "a-b-c");
    }

    #[test]
    fn test_leading_trailing() {
        assert_eq!(slugify_impl("  hello  ", "-"), "hello");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(slugify_impl("", "-"), "");
    }

    #[test]
    fn test_numbers() {
        assert_eq!(slugify_impl("ES2024 rocks", "-"), "es2024-rocks");
    }

    #[test]
    fn test_custom_separator() {
        assert_eq!(slugify_impl("Hello World", "_"), "hello_world");
    }
}
