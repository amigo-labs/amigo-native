use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn line_diff_offsets_basic() {
    let buf = amigo_diff_wasm::diff_lines_to_offsets("a\nb", "a\nc").unwrap();
    assert!(buf.len() >= 20);
    assert_eq!(buf.len() % 20, 0);
}

#[wasm_bindgen_test]
fn create_patch_basic() {
    let p = amigo_diff_wasm::create_patch("f.txt", "a\nb\n", "a\nc\n", None, None);
    assert!(p.contains("-b"));
    assert!(p.contains("+c"));
}
