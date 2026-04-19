extern crate napi_build;

fn main() {
    napi_build::setup();

    // Vendored crypt_blowfish C sources. See csrc/NOTICE.md for provenance.
    let mut build = cc::Build::new();
    build
        .file("csrc/crypt_blowfish.c")
        .file("csrc/crypt_gensalt.c")
        .include("csrc")
        .opt_level(3)
        .flag_if_supported("-fomit-frame-pointer")
        .flag_if_supported("-funroll-loops")
        .warnings(false);

    // The upstream code intentionally returns NULL on parameter validation
    // failure and uses errno for diagnostics. This is fine for our wrapper
    // which checks for NULL after each call.
    build.compile("crypt_blowfish");

    println!("cargo:rerun-if-changed=csrc/crypt_blowfish.c");
    println!("cargo:rerun-if-changed=csrc/crypt_blowfish.h");
    println!("cargo:rerun-if-changed=csrc/crypt_gensalt.c");
    println!("cargo:rerun-if-changed=csrc/crypt_gensalt.h");
    println!("cargo:rerun-if-changed=csrc/ow-crypt.h");
}
