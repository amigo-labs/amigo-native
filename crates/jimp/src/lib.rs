use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::io::Cursor;

// Scoped v0.1 of `@amigo-labs/jimp`. Per docs/perf-review/jimp.md, the v0.1
// charter is intentionally narrow:
//   - decode/encode: PNG, JPEG only
//   - operations: resize, crop, flip, rotate (90°), greyscale, invert,
//     brightness, contrast, composite
//   - color: 32-bit RGBA internally
// Everything else (GIF/BMP/TIFF, blur, gaussian, posterize, quantize, print,
// arbitrary-angle rotate) is out of scope for v0.1.

#[napi]
pub struct Jimp {
    img: image::RgbaImage,
}

fn rgba_from_decoded(img: image::DynamicImage) -> image::RgbaImage {
    img.to_rgba8()
}

#[napi]
impl Jimp {
    #[napi(factory)]
    pub fn from_buffer(input: Buffer) -> Result<Self> {
        let img = image::load_from_memory(input.as_ref())
            .map_err(|e| Error::from_reason(format!("jimp decode: {}", e)))?;
        Ok(Self {
            img: rgba_from_decoded(img),
        })
    }

    #[napi(factory)]
    pub fn create(width: u32, height: u32, color: Option<u32>) -> Result<Self> {
        let c = color.unwrap_or(0);
        let r = ((c >> 24) & 0xff) as u8;
        let g = ((c >> 16) & 0xff) as u8;
        let b = ((c >> 8) & 0xff) as u8;
        let a = (c & 0xff) as u8;
        let mut img = image::RgbaImage::new(width, height);
        for px in img.pixels_mut() {
            *px = image::Rgba([r, g, b, a]);
        }
        Ok(Self { img })
    }

    #[napi(getter)]
    pub fn width(&self) -> u32 {
        self.img.width()
    }

    #[napi(getter)]
    pub fn height(&self) -> u32 {
        self.img.height()
    }

    #[napi]
    pub fn resize(&mut self, w: u32, h: u32) -> Result<()> {
        let resized =
            image::imageops::resize(&self.img, w, h, image::imageops::FilterType::Triangle);
        self.img = resized;
        Ok(())
    }

    #[napi]
    pub fn crop(&mut self, x: u32, y: u32, w: u32, h: u32) -> Result<()> {
        if x.saturating_add(w) > self.img.width() || y.saturating_add(h) > self.img.height() {
            return Err(Error::from_reason("crop region out of bounds"));
        }
        let sub = image::imageops::crop_imm(&self.img, x, y, w, h).to_image();
        self.img = sub;
        Ok(())
    }

    #[napi]
    pub fn flip(&mut self, horizontal: bool, vertical: bool) {
        if horizontal {
            image::imageops::flip_horizontal_in_place(&mut self.img);
        }
        if vertical {
            image::imageops::flip_vertical_in_place(&mut self.img);
        }
    }

    #[napi]
    pub fn rotate(&mut self, deg: i32) -> Result<()> {
        let normalized = deg.rem_euclid(360);
        self.img = match normalized {
            0 => self.img.clone(),
            90 => image::imageops::rotate90(&self.img),
            180 => image::imageops::rotate180(&self.img),
            270 => image::imageops::rotate270(&self.img),
            _ => {
                return Err(Error::from_reason(
                    "v0.1 only supports 90° multiples for rotate()",
                ));
            }
        };
        Ok(())
    }

    #[napi]
    pub fn greyscale(&mut self) {
        // Convert each RGBA pixel to luma in place, preserving the source
        // alpha. Using image-rs's `grayscale` helper drops alpha because
        // it returns a single-channel image; we want jimp-parity, which
        // preserves transparency.
        for px in self.img.pixels_mut() {
            let r = px[0] as f32;
            let g = px[1] as f32;
            let b = px[2] as f32;
            // Rec. 601 luma — same coefficients as `image::imageops::grayscale`.
            let y = (0.2989 * r + 0.587 * g + 0.114 * b)
                .round()
                .clamp(0.0, 255.0) as u8;
            px[0] = y;
            px[1] = y;
            px[2] = y;
            // px[3] (alpha) intentionally left unchanged.
        }
    }

    #[napi]
    pub fn invert(&mut self) {
        for px in self.img.pixels_mut() {
            px[0] = 255 - px[0];
            px[1] = 255 - px[1];
            px[2] = 255 - px[2];
        }
    }

    #[napi]
    pub fn brightness(&mut self, value: f64) {
        let clamped = value.clamp(-1.0, 1.0);
        for px in self.img.pixels_mut() {
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

    #[napi]
    pub fn contrast(&mut self, value: f64) {
        let clamped = value.clamp(-1.0, 1.0);
        // Same formula as jimp@0.x's contrast(): adjust pixels around 0.5.
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
        for px in self.img.pixels_mut() {
            px[0] = adjust(px[0]);
            px[1] = adjust(px[1]);
            px[2] = adjust(px[2]);
        }
    }

    #[napi]
    pub fn composite(&mut self, src: &Jimp, x: i64, y: i64) {
        image::imageops::overlay(&mut self.img, &src.img, x, y);
    }

    #[napi]
    pub fn bitmap(&self) -> DecodedBitmap {
        DecodedBitmap {
            width: self.img.width(),
            height: self.img.height(),
            data: self.img.as_raw().clone().into(),
        }
    }

    #[napi(js_name = "getBufferSync")]
    pub fn get_buffer_sync(&self, mime: String) -> Result<Buffer> {
        let mut out: Vec<u8> = Vec::new();
        match mime.as_str() {
            "image/png" => {
                let mut cursor = Cursor::new(&mut out);
                self.img
                    .write_to(&mut cursor, image::ImageFormat::Png)
                    .map_err(|e| Error::from_reason(format!("jimp encode png: {}", e)))?;
            }
            "image/jpeg" | "image/jpg" => {
                let mut cursor = Cursor::new(&mut out);
                self.img
                    .write_to(&mut cursor, image::ImageFormat::Jpeg)
                    .map_err(|e| Error::from_reason(format!("jimp encode jpeg: {}", e)))?;
            }
            other => {
                return Err(Error::from_reason(format!(
                    "v0.1 supports image/png and image/jpeg only (got: {})",
                    other
                )));
            }
        }
        Ok(out.into())
    }
}

#[napi(object)]
pub struct DecodedBitmap {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
}
