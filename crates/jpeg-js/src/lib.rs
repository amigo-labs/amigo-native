use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::io::Cursor;

// Thin NAPI bindings over `jpeg-decoder` (decode) + `jpeg-encoder` (encode).
// Pure-Rust on both sides (no libjpeg-turbo C dependency in v0.1). Parity
// shape mirrors `jpeg-js`'s `decode` / `encode` return objects: RGBA pixels +
// width + height.

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

fn decode_inner(input: &[u8]) -> Result<(u32, u32, Vec<u8>)> {
    let mut decoder = jpeg_decoder::Decoder::new(Cursor::new(input));
    let pixels = decoder
        .decode()
        .map_err(|e| Error::from_reason(format!("jpeg decode: {}", e)))?;
    let info = decoder
        .info()
        .ok_or_else(|| Error::from_reason("jpeg metadata missing after decode"))?;
    let width = info.width as u32;
    let height = info.height as u32;

    let rgba = match info.pixel_format {
        jpeg_decoder::PixelFormat::RGB24 => {
            let mut out = Vec::with_capacity(pixels.len() / 3 * 4);
            for px in pixels.chunks_exact(3) {
                out.extend_from_slice(&[px[0], px[1], px[2], 255]);
            }
            out
        }
        jpeg_decoder::PixelFormat::L8 => {
            let mut out = Vec::with_capacity(pixels.len() * 4);
            for &g in &pixels {
                out.extend_from_slice(&[g, g, g, 255]);
            }
            out
        }
        jpeg_decoder::PixelFormat::CMYK32 => {
            return Err(Error::from_reason("CMYK JPEGs are out of scope for v0.1"));
        }
        other => {
            return Err(Error::from_reason(format!(
                "unsupported JPEG pixel format: {:?}",
                other
            )));
        }
    };

    Ok((width, height, rgba))
}

#[napi]
pub fn decode(input: Buffer) -> Result<DecodedJpeg> {
    let (width, height, rgba) = decode_inner(input.as_ref())?;
    Ok(DecodedJpeg {
        width,
        height,
        data: rgba.into(),
    })
}

#[napi(js_name = "decodeRgba")]
pub fn decode_rgba(input: Buffer) -> Result<DecodedJpeg> {
    decode(input)
}

fn encode_rgba_inner(pixels: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or_else(|| Error::from_reason("width * height * 4 overflows usize"))?;
    if pixels.len() != expected {
        return Err(Error::from_reason(format!(
            "pixel buffer must be width * height * 4 bytes ({} expected, got {})",
            expected,
            pixels.len()
        )));
    }

    let mut out: Vec<u8> = Vec::new();
    let encoder = jpeg_encoder::Encoder::new(&mut out, quality);
    encoder
        .encode(
            pixels,
            width as u16,
            height as u16,
            jpeg_encoder::ColorType::Rgba,
        )
        .map_err(|e| Error::from_reason(format!("jpeg encode: {}", e)))?;
    Ok(out)
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
    let out = encode_rgba_inner(pixels.as_ref(), width, height, quality)?;
    Ok(out.into())
}

#[napi]
pub fn encode(image: DecodedJpeg, quality: Option<u32>) -> Result<EncodedJpeg> {
    let q = quality.map(|q| q.min(100) as u8).unwrap_or(75);
    let out = encode_rgba_inner(image.data.as_ref(), image.width, image.height, q)?;
    Ok(EncodedJpeg {
        data: out.into(),
        width: image.width,
        height: image.height,
    })
}
