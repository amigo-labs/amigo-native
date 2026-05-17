use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn render_basic() {
    let html = amigo_commonmark_wasm::render("**hi**", JsValue::UNDEFINED).unwrap();
    assert!(html.contains("<strong>hi</strong>"));
}

#[wasm_bindgen_test]
fn render_fast_skips_heading_ids() {
    let html = amigo_commonmark_wasm::render_fast("# Title");
    assert!(!html.contains(r#"id="title""#));
}

#[wasm_bindgen_test]
fn renderer_class_works() {
    let r = amigo_commonmark_wasm::Renderer::new(JsValue::UNDEFINED).unwrap();
    let html = r.render("- item");
    assert!(html.contains("<li>"));
}
