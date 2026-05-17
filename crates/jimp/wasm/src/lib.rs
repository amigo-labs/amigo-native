use amigo_jimp_core as core;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Jimp {
    img: core::RgbaImage,
}

#[wasm_bindgen]
impl Jimp {
    #[wasm_bindgen(js_name = "fromBuffer")]
    pub fn from_buffer(input: &[u8]) -> Result<Jimp, JsError> {
        Ok(Jimp {
            img: core::from_buffer(input).map_err(|e| JsError::new(&e))?,
        })
    }

    #[wasm_bindgen]
    pub fn create(width: u32, height: u32, color: Option<u32>) -> Jimp {
        Jimp {
            img: core::create(width, height, color.unwrap_or(0)),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.img.width()
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.img.height()
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, w: u32, h: u32) {
        self.img = core::resize(&self.img, w, h);
    }

    #[wasm_bindgen]
    pub fn crop(&mut self, x: u32, y: u32, w: u32, h: u32) -> Result<(), JsError> {
        self.img = core::crop(&self.img, x, y, w, h).map_err(|e| JsError::new(&e))?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn flip(&mut self, horizontal: bool, vertical: bool) {
        core::flip(&mut self.img, horizontal, vertical);
    }

    #[wasm_bindgen]
    pub fn rotate(&mut self, deg: i32) -> Result<(), JsError> {
        self.img = core::rotate(&self.img, deg).map_err(|e| JsError::new(&e))?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn greyscale(&mut self) {
        core::greyscale(&mut self.img);
    }

    #[wasm_bindgen]
    pub fn invert(&mut self) {
        core::invert(&mut self.img);
    }

    #[wasm_bindgen]
    pub fn brightness(&mut self, value: f64) {
        core::brightness(&mut self.img, value);
    }

    #[wasm_bindgen]
    pub fn contrast(&mut self, value: f64) {
        core::contrast(&mut self.img, value);
    }

    #[wasm_bindgen]
    pub fn composite(&mut self, src: &Jimp, x: i64, y: i64) {
        core::composite(&mut self.img, &src.img, x, y);
    }

    #[wasm_bindgen]
    pub fn bitmap(&self) -> Vec<u8> {
        self.img.as_raw().clone()
    }

    #[wasm_bindgen(js_name = "getBufferSync")]
    pub fn get_buffer_sync(&self, mime: &str) -> Result<Vec<u8>, JsError> {
        core::encode(&self.img, mime).map_err(|e| JsError::new(&e))
    }
}
