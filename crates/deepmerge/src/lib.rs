//! JSON-safe deep merge. Arrays are concatenated (deepmerge default).
//! Rich types (Date, RegExp, Map, Set, Function) must be handled by the
//! JavaScript wrapper since they're not serialisable.

use napi_derive::napi;
use serde_json::{Map as JsonMap, Value};

#[napi(object)]
#[derive(Default)]
pub struct DeepmergeOptions {
    /// 'concat' (default), 'overwrite'
    pub array_merge: Option<String>,
}

const FORBIDDEN: &[&str] = &["__proto__", "constructor", "prototype"];

fn merge(target: Value, source: Value, array_merge: &str) -> Value {
    match (target, source) {
        (Value::Object(mut t), Value::Object(s)) => {
            for (k, sv) in s {
                if FORBIDDEN.iter().any(|f| *f == k) {
                    continue;
                }
                match t.remove(&k) {
                    Some(tv) => {
                        t.insert(k, merge(tv, sv, array_merge));
                    }
                    None => {
                        t.insert(k, sv);
                    }
                }
            }
            Value::Object(t)
        }
        (Value::Array(mut t), Value::Array(s)) => match array_merge {
            "overwrite" => Value::Array(s),
            _ => {
                t.extend(s);
                Value::Array(t)
            }
        },
        (_, s) => s,
    }
}

#[napi]
pub fn merge_json(target: Value, source: Value, options: Option<DeepmergeOptions>) -> Value {
    let array_merge = options
        .and_then(|o| o.array_merge)
        .unwrap_or_else(|| "concat".to_string());
    merge(target, source, &array_merge)
}

#[napi]
pub fn merge_all_json(values: Vec<Value>, options: Option<DeepmergeOptions>) -> Value {
    let array_merge = options
        .and_then(|o| o.array_merge)
        .unwrap_or_else(|| "concat".to_string());
    let mut iter = values.into_iter();
    let mut acc = iter.next().unwrap_or(Value::Object(JsonMap::new()));
    for v in iter {
        acc = merge(acc, v, &array_merge);
    }
    acc
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn simple_merge() {
        let a = json!({"a": 1, "b": 2});
        let b = json!({"b": 3, "c": 4});
        assert_eq!(merge(a, b, "concat"), json!({"a": 1, "b": 3, "c": 4}));
    }

    #[test]
    fn deep_merge() {
        let a = json!({"x": {"a": 1}});
        let b = json!({"x": {"b": 2}});
        assert_eq!(merge(a, b, "concat"), json!({"x": {"a": 1, "b": 2}}));
    }

    #[test]
    fn arrays_concat_by_default() {
        let a = json!({"l": [1, 2]});
        let b = json!({"l": [3, 4]});
        assert_eq!(merge(a, b, "concat"), json!({"l": [1, 2, 3, 4]}));
    }

    #[test]
    fn arrays_overwrite_option() {
        let a = json!({"l": [1, 2]});
        let b = json!({"l": [3, 4]});
        assert_eq!(merge(a, b, "overwrite"), json!({"l": [3, 4]}));
    }

    #[test]
    fn source_wins_for_primitive() {
        let a = json!({"x": 1});
        let b = json!({"x": 2});
        assert_eq!(merge(a, b, "concat"), json!({"x": 2}));
    }

    #[test]
    fn rejects_prototype_pollution() {
        let a = json!({"x": 1});
        let b = json!({"__proto__": {"polluted": true}, "constructor": {"bad": true}, "prototype": {"bad": true}});
        let out = merge(a, b, "concat");
        assert!(out.get("__proto__").is_none());
        assert!(out.get("constructor").is_none());
        assert!(out.get("prototype").is_none());
    }
}
