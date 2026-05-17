//! Shared PNG decode/encode via the image-rs `png` crate. Internal-only
//! crate; the napi and WASM bindings wrap these functions in their
//! respective FFI types.

use std::io::Cursor;

#[derive(Debug, Clone)]
pub struct DecodedRgba {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub fn decode_rgba(input: &[u8]) -> Result<DecodedRgba, String> {
    let decoder = png::Decoder::new(Cursor::new(input));
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("png decode: {}", e))?;
    let info = reader.info();
    let width = info.width;
    let height = info.height;

    let buf_size = reader.output_buffer_size().unwrap_or(0);
    let mut buf = vec![0u8; buf_size];
    let frame = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("png next_frame: {}", e))?;

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
            return Err(format!(
                "unsupported color/depth combo in v0.1: {:?} / {:?}",
                color, depth
            ));
        }
    };

    Ok(DecodedRgba {
        width,
        height,
        rgba,
    })
}

pub fn encode_rgba(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
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

    let mut out: Vec<u8> = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("png encode header: {}", e))?;
        writer
            .write_image_data(pixels)
            .map_err(|e| format!("png encode body: {}", e))?;
    }
    Ok(out)
}
