//! Shared JPEG decode/encode (pure-Rust) used by `@amigo-labs/jpeg-js`
//! napi and WASM bindings.

use std::io::Cursor;

#[derive(Debug, Clone)]
pub struct DecodedRgba {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub fn decode_rgba(input: &[u8]) -> Result<DecodedRgba, String> {
    let mut decoder = jpeg_decoder::Decoder::new(Cursor::new(input));
    let pixels = decoder
        .decode()
        .map_err(|e| format!("jpeg decode: {}", e))?;
    let info = decoder
        .info()
        .ok_or_else(|| "jpeg metadata missing after decode".to_string())?;
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
            return Err("CMYK JPEGs are out of scope for v0.1".to_string());
        }
        other => {
            return Err(format!("unsupported JPEG pixel format: {:?}", other));
        }
    };

    Ok(DecodedRgba {
        width,
        height,
        rgba,
    })
}

pub fn encode_rgba(pixels: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>, String> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or_else(|| "width * height * 4 overflows usize".to_string())?;
    if pixels.len() != expected {
        return Err(format!(
            "pixel buffer must be width * height * 4 bytes ({} expected, got {})",
            expected,
            pixels.len()
        ));
    }
    if width > u16::MAX as u32 || height > u16::MAX as u32 {
        return Err(format!(
            "JPEG dimensions must each be ≤ {} (got {}×{})",
            u16::MAX,
            width,
            height
        ));
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
        .map_err(|e| format!("jpeg encode: {}", e))?;
    Ok(out)
}
