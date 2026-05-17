//! PNG decode/encode — thin napi wrapper around `amigo-pngjs-core`.

use amigo_pngjs_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct DecodedPng {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
    pub depth: u32,
    pub color_type: String,
}

/// Encoder options. v0.1 has no tunables — preserved for the v0.2 wire-up.
#[napi(object)]
pub struct EncodeOptions {
    pub deflate_level: Option<u32>,
}

#[napi(js_name = "decodeRgba")]
pub fn decode_rgba(input: Buffer) -> Result<DecodedPng> {
    let d = core::decode_rgba(input.as_ref()).map_err(Error::from_reason)?;
    Ok(DecodedPng {
        width: d.width,
        height: d.height,
        data: d.rgba.into(),
        depth: 8,
        color_type: "rgba".to_string(),
    })
}

#[napi(js_name = "encodeRgba")]
pub fn encode_rgba(
    pixels: Buffer,
    width: u32,
    height: u32,
    _opts: Option<EncodeOptions>,
) -> Result<Buffer> {
    core::encode_rgba(pixels.as_ref(), width, height)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn read(input: Buffer) -> Result<DecodedPng> {
    decode_rgba(input)
}

#[napi]
pub fn write(png: DecodedPng, opts: Option<EncodeOptions>) -> Result<Buffer> {
    encode_rgba(png.data, png.width, png.height, opts)
}
