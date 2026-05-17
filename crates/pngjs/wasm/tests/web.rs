use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn roundtrip_2x2_rgba() {
    // 2x2 image with distinct colors per pixel.
    let pixels = vec![
        255, 0, 0, 255, // red
        0, 255, 0, 255, // green
        0, 0, 255, 255, // blue
        255, 255, 0, 255, // yellow
    ];
    let png = amigo_pngjs_wasm::encode_rgba(&pixels, 2, 2).unwrap();
    let decoded = amigo_pngjs_wasm::decode_rgba(&png).unwrap();
    assert!(!decoded.is_null());
}
