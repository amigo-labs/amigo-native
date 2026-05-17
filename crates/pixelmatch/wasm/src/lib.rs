use amigo_pixelmatch_core as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptionsJs {
    threshold: Option<f64>,
    include_aa: Option<bool>,
    alpha: Option<f64>,
    aa_color: Option<Vec<u8>>,
    diff_color: Option<Vec<u8>>,
    diff_color_alt: Option<Vec<u8>>,
    diff_mask: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultJs {
    num_diff: u32,
    diff: Vec<u8>,
}

fn resolve(options: JsValue) -> Result<core::Opts, JsError> {
    let o: OptionsJs = if options.is_undefined() || options.is_null() {
        OptionsJs::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
    };
    Ok(core::Opts {
        threshold: o.threshold.unwrap_or(0.1),
        include_aa: o.include_aa.unwrap_or(false),
        alpha: o.alpha.unwrap_or(0.1),
        aa_color: core::to_color(o.aa_color, [255, 255, 0]).map_err(|e| JsError::new(&e))?,
        diff_color: core::to_color(o.diff_color, [255, 0, 0]).map_err(|e| JsError::new(&e))?,
        diff_color_alt: core::to_color_alt(o.diff_color_alt).map_err(|e| JsError::new(&e))?,
        diff_mask: o.diff_mask.unwrap_or(false),
    })
}

#[wasm_bindgen]
pub fn pixelmatch(
    img1: &[u8],
    img2: &[u8],
    width: u32,
    height: u32,
    options: JsValue,
) -> Result<JsValue, JsError> {
    let (w, h) =
        core::validate_dims(img1.len(), img2.len(), width, height).map_err(|e| JsError::new(&e))?;
    let opts = resolve(options)?;
    let (num_diff, diff) = core::compute_with_diff(img1, img2, w, h, &opts);
    let js = ResultJs { num_diff, diff };
    serde_wasm_bindgen::to_value(&js).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = "countDiff")]
pub fn count_diff(
    img1: &[u8],
    img2: &[u8],
    width: u32,
    height: u32,
    options: JsValue,
) -> Result<u32, JsError> {
    let (w, h) =
        core::validate_dims(img1.len(), img2.len(), width, height).map_err(|e| JsError::new(&e))?;
    let opts = resolve(options)?;
    Ok(core::compute_count_only(img1, img2, w, h, &opts))
}
