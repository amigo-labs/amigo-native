//! JSON-safe deep merge. Thin napi wrapper around `amigo-deepmerge-core`.
//! See `crates/_deepmerge-core/src/lib.rs` for the algorithm.

use napi_derive::napi;
use serde_json::Value;

#[napi(object)]
#[derive(Default)]
pub struct DeepmergeOptions {
    /// 'concat' (default), 'overwrite'
    pub array_merge: Option<String>,
}

fn array_merge_mode(options: Option<DeepmergeOptions>) -> String {
    options
        .and_then(|o| o.array_merge)
        .unwrap_or_else(|| "concat".to_string())
}

#[napi]
pub fn merge_json(target: Value, source: Value, options: Option<DeepmergeOptions>) -> Value {
    amigo_deepmerge_core::merge(target, source, &array_merge_mode(options))
}

#[napi]
pub fn merge_all_json(values: Vec<Value>, options: Option<DeepmergeOptions>) -> Value {
    amigo_deepmerge_core::merge_all(values, &array_merge_mode(options))
}
