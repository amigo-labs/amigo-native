# Vendored: crypt_blowfish

Source files in this directory (`crypt_blowfish.c`, `crypt_blowfish.h`, `crypt_gensalt.c`, `crypt_gensalt.h`, `ow-crypt.h`) are vendored from [openwall/crypt_blowfish](https://github.com/openwall/crypt_blowfish), written by Solar Designer 1998–2014.

The code is **placed in the public domain**. From the upstream license header:

> No copyright is claimed, and the software is hereby placed in the public domain. In case this attempt to disclaim copyright and place the software in the public domain is deemed null and void, then the software is Copyright (c) 1998–2014 Solar Designer and it is hereby released to the general public under the following terms:
>
> Redistribution and use in source and binary forms, with or without modification, are permitted.
>
> There's ABSOLUTELY NO WARRANTY, express or implied.

## Why vendored

The pure-Rust `bcrypt` crate (`blowfish` cipher backend) is ~10 % slower than `crypt_blowfish` at industry-default cost factor 10, because hand-tuned C compiles to a tighter Blowfish inner loop than RustCrypto's portable `cipher`-trait abstraction. To meet the @amigo-labs Green-gate (≥1× vs the strongest JS competitor — bcrypt-npm, which itself uses this same `crypt_blowfish` source), we link the C directly.

## Local modifications

- `x86.S` (i386-only assembly) **not vendored** — our NAPI targets are x86_64 + aarch64 only.
- `wrapper.c` (POSIX `crypt(3)` interface) **not vendored** — we call `_crypt_blowfish_rn` and `_crypt_gensalt_blowfish_rn` directly.
- No source modifications. `build.rs` controls compile flags.
