//! Pixel-level RGBA diff (port of mapbox/pixelmatch) — thin napi wrapper
//! around `amigo-pixelmatch-core`. See the core crate for the algorithm.

use amigo_pixelmatch_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct PixelmatchOptions {
    pub threshold: Option<f64>,
    pub include_aa: Option<bool>,
    pub alpha: Option<f64>,
    pub aa_color: Option<Vec<u8>>,
    pub diff_color: Option<Vec<u8>>,
    pub diff_color_alt: Option<Vec<u8>>,
    pub diff_mask: Option<bool>,
}

#[napi(object)]
pub struct PixelmatchResult {
    pub num_diff: u32,
    pub diff: Buffer,
}

fn resolve(opts: Option<PixelmatchOptions>) -> Result<core::Opts> {
    let o = opts.unwrap_or(PixelmatchOptions {
        threshold: None,
        include_aa: None,
        alpha: None,
        aa_color: None,
        diff_color: None,
        diff_color_alt: None,
        diff_mask: None,
    });
    Ok(core::Opts {
        threshold: o.threshold.unwrap_or(0.1),
        include_aa: o.include_aa.unwrap_or(false),
        alpha: o.alpha.unwrap_or(0.1),
        aa_color: core::to_color(o.aa_color, [255, 255, 0]).map_err(Error::from_reason)?,
        diff_color: core::to_color(o.diff_color, [255, 0, 0]).map_err(Error::from_reason)?,
        diff_color_alt: core::to_color_alt(o.diff_color_alt).map_err(Error::from_reason)?,
        diff_mask: o.diff_mask.unwrap_or(false),
    })
}

#[napi]
pub fn pixelmatch(
    img1: Buffer,
    img2: Buffer,
    width: u32,
    height: u32,
    options: Option<PixelmatchOptions>,
) -> Result<PixelmatchResult> {
    let (w, h) =
        core::validate_dims(img1.len(), img2.len(), width, height).map_err(Error::from_reason)?;
    let opts = resolve(options)?;
    let (num_diff, diff) = core::compute_with_diff(img1.as_ref(), img2.as_ref(), w, h, &opts);
    Ok(PixelmatchResult {
        num_diff,
        diff: diff.into(),
    })
}

#[napi(js_name = "countDiff")]
pub fn count_diff(
    img1: Buffer,
    img2: Buffer,
    width: u32,
    height: u32,
    options: Option<PixelmatchOptions>,
) -> Result<u32> {
    let (w, h) =
        core::validate_dims(img1.len(), img2.len(), width, height).map_err(Error::from_reason)?;
    let opts = resolve(options)?;
    Ok(core::compute_count_only(
        img1.as_ref(),
        img2.as_ref(),
        w,
        h,
        &opts,
    ))
}
