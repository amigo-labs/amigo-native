use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn create_then_encode_png() {
    let img = amigo_jimp_wasm::Jimp::create(4, 4, Some(0xff_00_00_ff));
    let png = img.get_buffer_sync("image/png").unwrap();
    assert!(!png.is_empty());
}

#[wasm_bindgen_test]
fn create_resize_changes_dimensions() {
    let mut img = amigo_jimp_wasm::Jimp::create(4, 4, Some(0));
    img.resize(8, 8);
    assert_eq!(img.width(), 8);
    assert_eq!(img.height(), 8);
}
