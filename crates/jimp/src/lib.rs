//! Jimp-style image manipulation — thin napi wrapper around
//! `amigo-jimp-core`.

use amigo_jimp_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub struct Jimp {
    img: core::RgbaImage,
}

#[napi]
impl Jimp {
    #[napi(factory)]
    pub fn from_buffer(input: Buffer) -> Result<Self> {
        let img = core::from_buffer(input.as_ref()).map_err(Error::from_reason)?;
        Ok(Self { img })
    }

    #[napi(factory)]
    pub fn create(width: u32, height: u32, color: Option<u32>) -> Result<Self> {
        Ok(Self {
            img: core::create(width, height, color.unwrap_or(0)),
        })
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
        self.img = core::resize(&self.img, w, h);
        Ok(())
    }

    #[napi]
    pub fn crop(&mut self, x: u32, y: u32, w: u32, h: u32) -> Result<()> {
        self.img = core::crop(&self.img, x, y, w, h).map_err(Error::from_reason)?;
        Ok(())
    }

    #[napi]
    pub fn flip(&mut self, horizontal: bool, vertical: bool) {
        core::flip(&mut self.img, horizontal, vertical);
    }

    #[napi]
    pub fn rotate(&mut self, deg: i32) -> Result<()> {
        self.img = core::rotate(&self.img, deg).map_err(Error::from_reason)?;
        Ok(())
    }

    #[napi]
    pub fn greyscale(&mut self) {
        core::greyscale(&mut self.img);
    }

    #[napi]
    pub fn invert(&mut self) {
        core::invert(&mut self.img);
    }

    #[napi]
    pub fn brightness(&mut self, value: f64) {
        core::brightness(&mut self.img, value);
    }

    #[napi]
    pub fn contrast(&mut self, value: f64) {
        core::contrast(&mut self.img, value);
    }

    #[napi]
    pub fn composite(&mut self, src: &Jimp, x: i64, y: i64) {
        core::composite(&mut self.img, &src.img, x, y);
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
        core::encode(&self.img, &mime)
            .map(Buffer::from)
            .map_err(Error::from_reason)
    }
}

#[napi(object)]
pub struct DecodedBitmap {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
}
