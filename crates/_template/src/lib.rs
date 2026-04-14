use napi_derive::napi;

#[napi]
pub fn hello() -> String {
    "Hello from {{NAME}}!".to_string()
}
