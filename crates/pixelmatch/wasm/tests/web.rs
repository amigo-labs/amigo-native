use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

fn make_img(n_pixels: usize) -> Vec<u8> {
    let mut v = Vec::with_capacity(n_pixels * 4);
    for _ in 0..n_pixels {
        v.extend_from_slice(&[128, 64, 200, 255]);
    }
    v
}

#[wasm_bindgen_test]
fn identical_images_count_zero() {
    let img = make_img(16);
    let n = amigo_pixelmatch_wasm::count_diff(&img, &img, 4, 4, JsValue::UNDEFINED).unwrap();
    assert_eq!(n, 0);
}
