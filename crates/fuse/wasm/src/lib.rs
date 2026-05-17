use amigo_fuse_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct FuseKeyJs {
    name: String,
    weight: Option<f64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FuseOptionsJs {
    keys: Option<Vec<FuseKeyJs>>,
    threshold: Option<f64>,
    default_limit: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FuseResultJs {
    ref_index: u32,
    score: f64,
}

fn parse_opts(options: JsValue) -> Result<core::FuseOptions, JsError> {
    let o: FuseOptionsJs = if options.is_undefined() || options.is_null() {
        FuseOptionsJs::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
    };
    Ok(core::FuseOptions {
        keys: o
            .keys
            .map(|ks| {
                ks.into_iter()
                    .map(|k| (k.name, k.weight.unwrap_or(1.0)))
                    .collect()
            })
            .unwrap_or_default(),
        threshold: o.threshold,
        default_limit: o.default_limit,
    })
}

#[wasm_bindgen]
pub struct Fuse {
    inner: core::Fuse,
}

#[wasm_bindgen]
impl Fuse {
    #[wasm_bindgen(constructor)]
    pub fn new(records_json: Vec<String>, options: JsValue) -> Result<Fuse, JsError> {
        let opts = parse_opts(options)?;
        Ok(Fuse {
            inner: core::Fuse::new(records_json, opts),
        })
    }

    #[wasm_bindgen]
    pub fn search(&self, query: &str, limit: Option<u32>) -> Result<JsValue, JsError> {
        let results: Vec<FuseResultJs> = self
            .inner
            .search(query, limit)
            .into_iter()
            .map(|r| FuseResultJs {
                ref_index: r.ref_index,
                score: r.score,
            })
            .collect();
        serde_wasm_bindgen::to_value(&results).map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn size(&self) -> u32 {
        self.inner.size()
    }
}
