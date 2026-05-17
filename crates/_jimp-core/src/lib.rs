//! Shared image-manipulation core for `@amigo-labs/jimp`. Operations
//! mutate an `image::RgbaImage` in place; bindings own the lifetime of
//! the image and translate FFI types to/from `RgbaImage` + `Vec<u8>`.

use std::io::Cursor;

pub use image::RgbaImage;

pub fn from_buffer(input: &[u8]) -> Result<RgbaImage, String> {
    let img = image::load_from_memory(input).map_err(|e| format!("jimp decode: {}", e))?;
    Ok(img.to_rgba8())
}

pub fn create(width: u32, height: u32, color: u32) -> RgbaImage {
    let r = ((color >> 24) & 0xff) as u8;
    let g = ((color >> 16) & 0xff) as u8;
    let b = ((color >> 8) & 0xff) as u8;
    let a = (color & 0xff) as u8;
    let mut img = RgbaImage::new(width, height);
    for px in img.pixels_mut() {
        *px = image::Rgba([r, g, b, a]);
    }
    img
}

pub fn resize(img: &RgbaImage, w: u32, h: u32) -> RgbaImage {
    image::imageops::resize(img, w, h, image::imageops::FilterType::Triangle)
}

pub fn crop(img: &RgbaImage, x: u32, y: u32, w: u32, h: u32) -> Result<RgbaImage, String> {
    if x.saturating_add(w) > img.width() || y.saturating_add(h) > img.height() {
        return Err("crop region out of bounds".to_string());
    }
    Ok(image::imageops::crop_imm(img, x, y, w, h).to_image())
}

pub fn flip(img: &mut RgbaImage, horizontal: bool, vertical: bool) {
    if horizontal {
        image::imageops::flip_horizontal_in_place(img);
    }
    if vertical {
        image::imageops::flip_vertical_in_place(img);
    }
}

pub fn rotate(img: &RgbaImage, deg: i32) -> Result<RgbaImage, String> {
    let normalized = deg.rem_euclid(360);
    Ok(match normalized {
        0 => img.clone(),
        90 => image::imageops::rotate90(img),
        180 => image::imageops::rotate180(img),
        270 => image::imageops::rotate270(img),
        _ => return Err("v0.1 only supports 90° multiples for rotate()".to_string()),
    })
}

pub fn greyscale(img: &mut RgbaImage) {
    for px in img.pixels_mut() {
        let r = px[0] as f32;
        let g = px[1] as f32;
        let b = px[2] as f32;
        let y = (0.2989 * r + 0.587 * g + 0.114 * b)
            .round()
            .clamp(0.0, 255.0) as u8;
        px[0] = y;
        px[1] = y;
        px[2] = y;
    }
}

pub fn invert(img: &mut RgbaImage) {
    for px in img.pixels_mut() {
        px[0] = 255 - px[0];
        px[1] = 255 - px[1];
        px[2] = 255 - px[2];
    }
}

pub fn brightness(img: &mut RgbaImage, value: f64) {
    let clamped = value.clamp(-1.0, 1.0);
    for px in img.pixels_mut() {
        for c in &mut px.0[..3] {
            let f = *c as f64;
            let v = if clamped < 0.0 {
                f * (1.0 + clamped)
            } else {
                f + (255.0 - f) * clamped
            };
            *c = v.round().clamp(0.0, 255.0) as u8;
        }
    }
}

pub fn contrast(img: &mut RgbaImage, value: f64) {
    let clamped = value.clamp(-1.0, 1.0);
    let adjust = |c: u8| -> u8 {
        let f = c as f64 / 255.0;
        let v = if clamped < 0.0 {
            ((f - 0.5) * (1.0 + clamped)) + 0.5
        } else if clamped > 0.0 {
            (f - 0.5) / (1.0 - clamped).max(1e-9) + 0.5
        } else {
            f
        };
        (v.clamp(0.0, 1.0) * 255.0).round() as u8
    };
    for px in img.pixels_mut() {
        px[0] = adjust(px[0]);
        px[1] = adjust(px[1]);
        px[2] = adjust(px[2]);
    }
}

pub fn composite(dst: &mut RgbaImage, src: &RgbaImage, x: i64, y: i64) {
    image::imageops::overlay(dst, src, x, y);
}

pub fn encode(img: &RgbaImage, mime: &str) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut out);
    let fmt = match mime {
        "image/png" => image::ImageFormat::Png,
        "image/jpeg" | "image/jpg" => image::ImageFormat::Jpeg,
        other => {
            return Err(format!(
                "v0.1 supports image/png and image/jpeg only (got: {})",
                other
            ));
        }
    };
    img.write_to(&mut cursor, fmt)
        .map_err(|e| format!("jimp encode: {}", e))?;
    Ok(out)
}
