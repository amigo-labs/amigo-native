use serde::Serialize;
use wasm_bindgen_test::*;

#[derive(Serialize)]
struct Doc {
    title: Option<String>,
    pages: Vec<Page>,
}

#[derive(Serialize)]
struct Page {
    width: f64,
    height: f64,
    elements: Vec<Elem>,
}

#[derive(Serialize)]
struct Elem {
    kind: String,
    text: Option<TextEl>,
    line: Option<()>,
    rect: Option<()>,
}

#[derive(Serialize)]
struct TextEl {
    kind: String,
    x: f64,
    y: f64,
    text: String,
    #[serde(rename = "fontSize")]
    font_size: Option<f64>,
}

#[wasm_bindgen_test]
fn generate_one_page_pdf() {
    let doc = Doc {
        title: Some("test".into()),
        pages: vec![Page {
            width: 210.0,
            height: 297.0,
            elements: vec![Elem {
                kind: "text".into(),
                text: Some(TextEl {
                    kind: "text".into(),
                    x: 10.0,
                    y: 10.0,
                    text: "hello".into(),
                    font_size: Some(12.0),
                }),
                line: None,
                rect: None,
            }],
        }],
    };
    let js = serde_wasm_bindgen::to_value(&doc).unwrap();
    let bytes = amigo_pdf_wasm::generate(js).unwrap();
    assert!(bytes.len() > 100);
    assert!(bytes.starts_with(b"%PDF"));
}
