//! JPEG decode/encode — thin napi wrapper around `amigo-jpeg-js-core`.

use amigo_jpeg_js_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct DecodedJpeg {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
}

#[napi(object)]
pub struct EncodedJpeg {
    pub data: Buffer,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct EncodeOptions {
    pub quality: Option<u32>,
}

#[napi]
pub fn decode(input: Buffer) -> Result<DecodedJpeg> {
    let d = core::decode_rgba(input.as_ref()).map_err(Error::from_reason)?;
    Ok(DecodedJpeg {
        width: d.width,
        height: d.height,
        data: d.rgba.into(),
    })
}

#[napi(js_name = "decodeRgba")]
pub fn decode_rgba(input: Buffer) -> Result<DecodedJpeg> {
    decode(input)
}

#[napi(js_name = "encodeRgba")]
pub fn encode_rgba(
    pixels: Buffer,
    width: u32,
    height: u32,
    opts: Option<EncodeOptions>,
) -> Result<Buffer> {
    let quality = opts
        .as_ref()
        .and_then(|o| o.quality)
        .map(|q| q.min(100) as u8)
        .unwrap_or(75);
    core::encode_rgba(pixels.as_ref(), width, height, quality)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn encode(image: DecodedJpeg, quality: Option<u32>) -> Result<EncodedJpeg> {
    let q = quality.map(|q| q.min(100) as u8).unwrap_or(75);
    let out = core::encode_rgba(image.data.as_ref(), image.width, image.height, q)
        .map_err(Error::from_reason)?;
    Ok(EncodedJpeg {
        data: out.into(),
        width: image.width,
        height: image.height,
    })
}
