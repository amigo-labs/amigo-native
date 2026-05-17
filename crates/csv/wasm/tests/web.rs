use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn count_rows_basic() {
    let n = amigo_csv_wasm::count_rows(b"a,b,c\n1,2,3\n4,5,6\n", JsValue::UNDEFINED).unwrap();
    assert_eq!(n, 2); // has_headers default = true => first row consumed as header
}

#[wasm_bindgen_test]
fn parse_str_basic() {
    let rows =
        amigo_csv_wasm::parse_str("name,age\nAlice,30\nBob,25\n", JsValue::UNDEFINED).unwrap();
    assert!(!rows.is_undefined());
}
