use napi::bindgen_prelude::*;
use napi_derive::napi;

// Thin NAPI bindings over `psl` (bundled IANA Public Suffix List) + `idna`.
// Parity drop-in for `tldts.parse` / `getDomain` / `getPublicSuffix` /
// `getHostname` / `getSubdomain`. The `parseMany` batch API is the
// Green-shape lever from the perf-review.

#[napi(object)]
pub struct ParseResult {
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub subdomain: Option<String>,
    pub public_suffix: Option<String>,
    pub is_icann: bool,
    pub is_private: bool,
    pub is_ip: bool,
}

#[napi(object)]
pub struct ParseOptions {
    pub allow_private_domains: Option<bool>,
    pub detect_ip: Option<bool>,
    pub extract_hostname: Option<bool>,
}

fn extract_hostname(input: &str) -> Option<String> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    // Strip scheme: only the first ://, conservatively.
    let after_scheme = match s.find("://") {
        Some(i) => &s[i + 3..],
        None => s,
    };
    // userinfo
    let after_userinfo = match after_scheme.rfind('@') {
        Some(i) => &after_scheme[i + 1..],
        None => after_scheme,
    };
    // path / query / fragment terminator
    let end = after_userinfo
        .find(|c: char| c == '/' || c == '?' || c == '#')
        .unwrap_or(after_userinfo.len());
    let hostport = &after_userinfo[..end];
    // Strip port (but preserve IPv6 brackets which contain colons).
    let host = if hostport.starts_with('[') {
        match hostport.find(']') {
            Some(close) => &hostport[..=close],
            None => hostport,
        }
    } else {
        match hostport.rfind(':') {
            Some(i) => &hostport[..i],
            None => hostport,
        }
    };
    if host.is_empty() {
        None
    } else {
        Some(host.to_ascii_lowercase())
    }
}

fn is_ip(host: &str) -> bool {
    if host.starts_with('[') && host.ends_with(']') {
        return host[1..host.len() - 1]
            .parse::<std::net::Ipv6Addr>()
            .is_ok();
    }
    host.parse::<std::net::Ipv4Addr>().is_ok() || host.parse::<std::net::Ipv6Addr>().is_ok()
}

fn to_ascii_idn(host: &str) -> Option<String> {
    match idna::domain_to_ascii(host) {
        Ok(s) => Some(s),
        Err(_) => None,
    }
}

fn parse_one(input: &str, _opts: &ParseOptions) -> ParseResult {
    let hostname = extract_hostname(input);
    let host = match hostname.as_deref() {
        Some(h) => h.to_string(),
        None => {
            return ParseResult {
                hostname: None,
                domain: None,
                subdomain: None,
                public_suffix: None,
                is_icann: false,
                is_private: false,
                is_ip: false,
            };
        }
    };

    if is_ip(&host) {
        return ParseResult {
            hostname: Some(host),
            domain: None,
            subdomain: None,
            public_suffix: None,
            is_icann: false,
            is_private: false,
            is_ip: true,
        };
    }

    let ascii = to_ascii_idn(&host).unwrap_or_else(|| host.clone());

    let suffix = psl::suffix(ascii.as_bytes());
    let domain_info = psl::domain(ascii.as_bytes());

    let public_suffix = suffix
        .as_ref()
        .map(|s| String::from_utf8_lossy(s.as_bytes()).to_string());
    let domain = domain_info
        .as_ref()
        .map(|d| String::from_utf8_lossy(d.as_bytes()).to_string());

    let subdomain = match (&ascii, &domain) {
        (full, Some(d)) if full.len() > d.len() && full.ends_with(d.as_str()) => {
            let split = full.len() - d.len() - 1;
            if split == 0 {
                None
            } else {
                Some(full[..split].to_string())
            }
        }
        _ => None,
    };

    let is_icann = suffix.as_ref().map(|s| s.is_known()).unwrap_or(false);
    let is_private = false; // psl crate's known/unknown does not split icann/private.

    ParseResult {
        hostname: Some(ascii),
        domain,
        subdomain,
        public_suffix,
        is_icann,
        is_private,
        is_ip: false,
    }
}

fn default_opts(opts: Option<ParseOptions>) -> ParseOptions {
    opts.unwrap_or(ParseOptions {
        allow_private_domains: None,
        detect_ip: None,
        extract_hostname: None,
    })
}

#[napi]
pub fn parse(input: String, options: Option<ParseOptions>) -> ParseResult {
    let opts = default_opts(options);
    parse_one(&input, &opts)
}

#[napi(js_name = "getDomain")]
pub fn get_domain(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).domain
}

#[napi(js_name = "getPublicSuffix")]
pub fn get_public_suffix(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).public_suffix
}

#[napi(js_name = "getHostname")]
pub fn get_hostname(input: String) -> Option<String> {
    extract_hostname(&input)
}

#[napi(js_name = "getSubdomain")]
pub fn get_subdomain(input: String, options: Option<ParseOptions>) -> Option<String> {
    parse(input, options).subdomain
}

#[napi(object)]
pub struct ParseManyResult {
    pub domains: Vec<Option<String>>,
    pub public_suffixes: Vec<Option<String>>,
    pub flags: Buffer,
}

#[napi(js_name = "parseMany")]
pub fn parse_many(inputs: Vec<String>, options: Option<ParseOptions>) -> ParseManyResult {
    let opts = default_opts(options);
    let n = inputs.len();
    let mut domains = Vec::with_capacity(n);
    let mut public_suffixes = Vec::with_capacity(n);
    let mut flags: Vec<u8> = Vec::with_capacity(n);
    for input in &inputs {
        let r = parse_one(input, &opts);
        domains.push(r.domain);
        public_suffixes.push(r.public_suffix);
        let mut bits = 0u8;
        if r.is_icann {
            bits |= 0b0001;
        }
        if r.is_private {
            bits |= 0b0010;
        }
        if r.is_ip {
            bits |= 0b0100;
        }
        if r.hostname.is_some() {
            bits |= 0b1000;
        }
        flags.push(bits);
    }
    ParseManyResult {
        domains,
        public_suffixes,
        flags: flags.into(),
    }
}
