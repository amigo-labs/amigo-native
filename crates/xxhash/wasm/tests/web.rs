use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn xxh32_known_vector() {
    // Reference: well-known xxhash test vector
    assert_eq!(amigo_xxhash_wasm::xxh32(b"abc", None), 0x32D153FF);
}

#[wasm_bindgen_test]
fn xxh3_128_hex_length() {
    let h = amigo_xxhash_wasm::xxh3_128(b"hello", None);
    assert_eq!(h.len(), 32);
}

#[wasm_bindgen_test]
fn xxh32_hasher_streams() {
    let mut h = amigo_xxhash_wasm::Xxh32Hasher::new(None);
    h.update(b"abc");
    let streamed = h.digest();
    let oneshot = amigo_xxhash_wasm::xxh32(b"abc", None);
    assert_eq!(streamed, oneshot);
}
