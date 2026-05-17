use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

// Minimal valid PDF (the standard "hello world" 1.4 fixture).
const MIN_PDF: &[u8] = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000098 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n151\n%%EOF\n";

#[wasm_bindgen_test]
fn parse_sync_minimal_pdf_runs() {
    // The minimal fixture above may or may not parse cleanly, but the
    // call should at least not panic.
    let _ = amigo_pdf_parse_wasm::parse_sync(MIN_PDF, JsValue::UNDEFINED);
}
