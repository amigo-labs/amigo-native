use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn encode_then_decode_roundtrip() {
    let rgba: Vec<u8> = (0..(8 * 8)).flat_map(|_| [128, 64, 200, 255]).collect();
    let jpeg = amigo_jpeg_js_wasm::encode_rgba(&rgba, 8, 8, None).unwrap();
    let decoded = amigo_jpeg_js_wasm::decode(&jpeg).unwrap();
    assert!(!decoded.is_null());
}
