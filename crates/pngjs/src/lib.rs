use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::io::Cursor;

// Thin NAPI bindings over the image-rs `png` crate. The pure-JS upstream
// `PNG.sync.read` returns a `{ width, height, data: Buffer, depth, ... }`
// object with RGBA pixels. We match that shape (RGBA, 8-bit) on the parity
// path and expose `decodeRgba` / `encodeRgba` as the byte-flat fast lane.

#[napi(object)]
pub struct DecodedPng {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
    pub depth: u32,
    pub color_type: String,
}

/// Encoder options. v0.1 has no tunables — the encoder always uses
/// image-rs `png`'s default DEFLATE settings, regardless of any value
/// passed in `deflate_level`. The field is preserved for the v0.2
/// wire-up so callers don't need an API churn when it lands.
#[napi(object)]
pub struct EncodeOptions {
    pub deflate_level: Option<u32>,
}

fn decode_rgba_inner(input: &[u8]) -> Result<(u32, u32, Vec<u8>)> {
    let decoder = png::Decoder::new(Cursor::new(input));
    let mut reader = decoder
        .read_info()
        .map_err(|e| Error::from_reason(format!("png decode: {}", e)))?;
    let info = reader.info();
    let width = info.width;
    let height = info.height;

    let buf_size = reader.output_buffer_size().unwrap_or(0);
    let mut buf = vec![0u8; buf_size];
    let frame = reader
        .next_frame(&mut buf)
        .map_err(|e| Error::from_reason(format!("png next_frame: {}", e)))?;

    let bytes = &buf[..frame.buffer_size()];

    let rgba: Vec<u8> = match (frame.color_type, frame.bit_depth) {
        (png::ColorType::Rgba, png::BitDepth::Eight) => bytes.to_vec(),
        (png::ColorType::Rgb, png::BitDepth::Eight) => {
            let mut out = Vec::with_capacity(bytes.len() / 3 * 4);
            for px in bytes.chunks_exact(3) {
                out.extend_from_slice(&[px[0], px[1], px[2], 255]);
            }
            out
        }
        (png::ColorType::Grayscale, png::BitDepth::Eight) => {
            let mut out = Vec::with_capacity(bytes.len() * 4);
            for &g in bytes {
                out.extend_from_slice(&[g, g, g, 255]);
            }
            out
        }
        (png::ColorType::GrayscaleAlpha, png::BitDepth::Eight) => {
            let mut out = Vec::with_capacity(bytes.len() * 2);
            for px in bytes.chunks_exact(2) {
                out.extend_from_slice(&[px[0], px[0], px[0], px[1]]);
            }
            out
        }
        (color, depth) => {
            return Err(Error::from_reason(format!(
                "unsupported color/depth combo in v0.1: {:?} / {:?}",
                color, depth
            )));
        }
    };

    Ok((width, height, rgba))
}

#[napi(js_name = "decodeRgba")]
pub fn decode_rgba(input: Buffer) -> Result<DecodedPng> {
    let (width, height, rgba) = decode_rgba_inner(input.as_ref())?;
    Ok(DecodedPng {
        width,
        height,
        data: rgba.into(),
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
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| Error::from_reason(format!("png encode header: {}", e)))?;
        writer
            .write_image_data(pixels.as_ref())
            .map_err(|e| Error::from_reason(format!("png encode body: {}", e)))?;
    }
    Ok(out.into())
}

#[napi]
pub fn read(input: Buffer) -> Result<DecodedPng> {
    decode_rgba(input)
}

#[napi]
pub fn write(png: DecodedPng, opts: Option<EncodeOptions>) -> Result<Buffer> {
    encode_rgba(png.data, png.width, png.height, opts)
}
