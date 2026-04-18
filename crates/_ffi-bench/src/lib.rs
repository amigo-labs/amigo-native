//! FFI-overhead micro-benchmarks.
//!
//! Measures the per-call cost of crossing the N-API boundary with
//! different argument / return shapes. Not a production package — lives
//! under `crates/_ffi-bench/` only to generate numbers for
//! `docs/BASELINE.md`, which every other crate in this repo is
//! evaluated against.
//!
//! Interpreting the numbers:
//! - `noop`: the floor. Anything slower than this is work on top of
//!   the pure FFI crossing.
//! - `echoString(s) -> String`: UTF-16 → UTF-8 conversion (input) +
//!   UTF-8 → UTF-16 conversion (return). This is what every
//!   `fn foo(x: String) -> String` in the repo pays. napi-rs does not
//!   support `&str` parameters (JS strings are primitives and can't
//!   be borrowed across the FFI boundary), so there's no cheaper
//!   string-input shape available.
//! - `echoBuffer(b) -> Buffer`: no conversion, the buffer is a view
//!   into V8 memory both ways. Should be nearly flat across sizes.
//! - `sumArray(xs: Vec<u32>) -> u64`: measures the per-element array
//!   marshalling cost.

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn noop() -> u32 {
    0
}

#[napi(js_name = "echoString")]
pub fn echo_string(s: String) -> String {
    s
}

#[napi(js_name = "echoBuffer")]
pub fn echo_buffer(b: Buffer) -> Buffer {
    b
}

#[napi(js_name = "sumArray")]
pub fn sum_array(xs: Vec<u32>) -> BigInt {
    let sum: u64 = xs.iter().map(|x| *x as u64).sum();
    BigInt::from(sum)
}
