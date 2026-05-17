use wasm_bindgen_test::*;

// Pre-computed zstd frame: encode_all(b"hello world", 3) produces this
// 21-byte frame. Decompresses back to the original input.
const HELLO_WORLD_ZSTD: &[u8] = &[
    0x28, 0xb5, 0x2f, 0xfd, 0x24, 0x0b, 0x59, 0x00, 0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77,
    0x6f, 0x72, 0x6c, 0x64, 0x6f, 0xa6, 0x47, 0xd0,
];

#[wasm_bindgen_test]
fn decompress_known_frame() {
    let out = amigo_zstd_wasm::decompress(HELLO_WORLD_ZSTD).unwrap();
    assert_eq!(out, b"hello world");
}

#[wasm_bindgen_test]
fn compress_errors_in_wasm() {
    let r = amigo_zstd_wasm::compress(b"x", None);
    assert!(r.is_err());
}
