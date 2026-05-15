use napi_derive::napi;

#[napi]
pub fn slugify(input: String) -> String {
    amigo_slugify_core::slugify(&input, "-")
}

#[napi(js_name = "slugifyWithSeparator")]
pub fn slugify_with_separator(input: String, separator: String) -> String {
    amigo_slugify_core::slugify(&input, &separator)
}
