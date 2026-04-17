//! JSON-safe deep equality. See `wrapper.js` for the richer JS-side
//! implementation (handles Date/RegExp/Map/Set) with a Rust fast-path for
//! large plain-JSON structures.

use napi_derive::napi;
use serde_json::Value;

fn eq_value(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Number(x), Value::Number(y)) => {
            // serde_json preserves integer vs float; compare as-is
            x == y
        }
        (Value::String(x), Value::String(y)) => x == y,
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return false;
            }
            x.iter().zip(y.iter()).all(|(a, b)| eq_value(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return false;
            }
            x.iter()
                .all(|(k, va)| y.get(k).is_some_and(|vb| eq_value(va, vb)))
        }
        _ => false,
    }
}

/// Deep structural equality for JSON-safe values. Accepts anything that
/// serialises through napi's serde bridge. Rejects the call (returns false)
/// rather than throwing for cyclic inputs — callers should detect cycles
/// JS-side via the wrapper.
#[napi]
pub fn deep_equal_json(a: Value, b: Value) -> bool {
    eq_value(&a, &b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn primitives() {
        assert!(eq_value(&json!(1), &json!(1)));
        assert!(!eq_value(&json!(1), &json!(2)));
        assert!(eq_value(&json!("a"), &json!("a")));
        assert!(eq_value(&json!(null), &json!(null)));
    }

    #[test]
    fn nested_object() {
        assert!(eq_value(
            &json!({"a": {"b": [1, 2, 3]}}),
            &json!({"a": {"b": [1, 2, 3]}}),
        ));
        assert!(!eq_value(
            &json!({"a": {"b": [1, 2, 3]}}),
            &json!({"a": {"b": [1, 2, 4]}}),
        ));
    }

    #[test]
    fn array_order_matters() {
        assert!(!eq_value(&json!([1, 2, 3]), &json!([3, 2, 1])));
    }

    #[test]
    fn key_order_does_not_matter() {
        assert!(eq_value(&json!({"a": 1, "b": 2}), &json!({"b": 2, "a": 1})));
    }
}
