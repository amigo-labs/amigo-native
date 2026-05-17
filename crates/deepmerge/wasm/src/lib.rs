use serde_json::Value;
use wasm_bindgen::prelude::*;

fn array_merge_mode(options: JsValue) -> Result<String, JsError> {
    if options.is_undefined() || options.is_null() {
        return Ok("concat".to_string());
    }
    // Accept either { arrayMerge: 'concat' | 'overwrite' } or a raw string.
    #[derive(serde::Deserialize)]
    struct Opts {
        #[serde(rename = "arrayMerge")]
        array_merge: Option<String>,
    }
    let opts: Opts =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(opts.array_merge.unwrap_or_else(|| "concat".to_string()))
}

fn js_to_value(v: JsValue) -> Result<Value, JsError> {
    serde_wasm_bindgen::from_value(v).map_err(|e| JsError::new(&e.to_string()))
}

fn value_to_js(v: Value) -> Result<JsValue, JsError> {
    serde_wasm_bindgen::to_value(&v).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "mergeJson")]
pub fn merge_json(target: JsValue, source: JsValue, options: JsValue) -> Result<JsValue, JsError> {
    let mode = array_merge_mode(options)?;
    let t = js_to_value(target)?;
    let s = js_to_value(source)?;
    value_to_js(amigo_deepmerge_core::merge(t, s, &mode))
}

#[wasm_bindgen(js_name = "mergeAllJson")]
pub fn merge_all_json(values: JsValue, options: JsValue) -> Result<JsValue, JsError> {
    let mode = array_merge_mode(options)?;
    let vs: Vec<Value> = js_to_value(values)?
        .as_array()
        .cloned()
        .ok_or_else(|| JsError::new("expected an array of values"))?;
    value_to_js(amigo_deepmerge_core::merge_all(vs, &mode))
}
