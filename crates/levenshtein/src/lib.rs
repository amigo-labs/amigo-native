use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct LevenshteinOptions {
    /// fast-levenshtein-compatible collator flag: when true, both strings are
    /// lowercased before comparison (UTF-8 aware).
    pub use_collator: Option<bool>,
}

const SIMD_THRESHOLD: usize = 16;

fn distance_impl(a: &str, b: &str, use_collator: bool) -> u32 {
    // fast-levenshtein is byte-oriented; so is triple_accel and strsim::levenshtein.
    // For non-ASCII collator mode we must lowercase on a char level.
    let (owned_a, owned_b);
    let (sa, sb) = if use_collator {
        owned_a = a.to_lowercase();
        owned_b = b.to_lowercase();
        (owned_a.as_str(), owned_b.as_str())
    } else {
        (a, b)
    };

    let ba = sa.as_bytes();
    let bb = sb.as_bytes();

    if ba.len().min(bb.len()) < SIMD_THRESHOLD {
        strsim::levenshtein(sa, sb) as u32
    } else {
        triple_accel::levenshtein(ba, bb)
    }
}

/// fast-levenshtein-compatible API.
#[napi]
pub fn get(a: String, b: String, options: Option<LevenshteinOptions>) -> u32 {
    let use_collator = options.and_then(|o| o.use_collator).unwrap_or(false);
    distance_impl(&a, &b, use_collator)
}

/// Cleaner modern alias for `get`.
#[napi]
pub fn distance(a: String, b: String, options: Option<LevenshteinOptions>) -> u32 {
    let use_collator = options.and_then(|o| o.use_collator).unwrap_or(false);
    distance_impl(&a, &b, use_collator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_strings() {
        assert_eq!(distance_impl("", "", false), 0);
    }

    #[test]
    fn identical() {
        assert_eq!(distance_impl("kitten", "kitten", false), 0);
    }

    #[test]
    fn classic_kitten_sitting() {
        assert_eq!(distance_impl("kitten", "sitting", false), 3);
    }

    #[test]
    fn one_empty() {
        assert_eq!(distance_impl("abc", "", false), 3);
        assert_eq!(distance_impl("", "abc", false), 3);
    }

    #[test]
    fn long_strings_use_simd_path() {
        let a = "a".repeat(100);
        let b = format!("{}b", "a".repeat(99));
        assert_eq!(distance_impl(&a, &b, false), 1);
    }

    #[test]
    fn collator_lowercases() {
        assert_eq!(distance_impl("Hello", "hello", true), 0);
        assert_eq!(distance_impl("Hello", "hello", false), 1);
    }
}
