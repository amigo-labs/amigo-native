//! Shared tldts logic — internal crate used by both the napi and WASM
//! bindings. Wraps `psl` (bundled IANA Public Suffix List) + `idna`.

#[derive(Default, Debug, Clone, Copy)]
pub struct ParseOptions {
    pub allow_private_domains: Option<bool>,
    pub detect_ip: Option<bool>,
    pub extract_hostname: Option<bool>,
}

#[derive(Debug, Clone, Default)]
pub struct ParseResult {
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub subdomain: Option<String>,
    pub public_suffix: Option<String>,
    pub is_icann: bool,
    pub is_private: bool,
    pub is_ip: bool,
}

fn extract_hostname(input: &str) -> Option<String> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    let after_scheme = match s.find("://") {
        Some(i) => &s[i + 3..],
        None => s,
    };
    let after_userinfo = match after_scheme.rfind('@') {
        Some(i) => &after_scheme[i + 1..],
        None => after_scheme,
    };
    let end = after_userinfo
        .find(['/', '?', '#'])
        .unwrap_or(after_userinfo.len());
    let hostport = &after_userinfo[..end];
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
    idna::domain_to_ascii(host).ok()
}

pub fn parse_one(input: &str, opts: &ParseOptions) -> ParseResult {
    let hostname = if opts.extract_hostname == Some(false) {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_ascii_lowercase())
        }
    } else {
        extract_hostname(input)
    };
    let host = match hostname.as_deref() {
        Some(h) => h.to_string(),
        None => return ParseResult::default(),
    };

    if is_ip(&host) {
        return ParseResult {
            hostname: Some(host),
            is_ip: true,
            ..Default::default()
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
    let is_private = false;

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

pub fn get_hostname(input: &str) -> Option<String> {
    extract_hostname(input).map(|h| to_ascii_idn(&h).unwrap_or(h))
}

#[derive(Debug, Clone, Default)]
pub struct ParseManyResult {
    pub domains: Vec<Option<String>>,
    pub public_suffixes: Vec<Option<String>>,
    pub flags: Vec<u8>,
}

pub fn parse_many(inputs: &[String], opts: &ParseOptions) -> ParseManyResult {
    let n = inputs.len();
    let mut out = ParseManyResult {
        domains: Vec::with_capacity(n),
        public_suffixes: Vec::with_capacity(n),
        flags: Vec::with_capacity(n),
    };
    for input in inputs {
        let r = parse_one(input, opts);
        out.domains.push(r.domain);
        out.public_suffixes.push(r.public_suffix);
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
        out.flags.push(bits);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_domain() {
        let r = parse_one("https://www.example.com/path", &ParseOptions::default());
        assert_eq!(r.hostname.as_deref(), Some("www.example.com"));
        assert_eq!(r.domain.as_deref(), Some("example.com"));
        assert_eq!(r.subdomain.as_deref(), Some("www"));
        assert_eq!(r.public_suffix.as_deref(), Some("com"));
        assert!(r.is_icann);
        assert!(!r.is_ip);
    }

    #[test]
    fn ip_is_detected() {
        let r = parse_one("http://127.0.0.1:8080/", &ParseOptions::default());
        assert!(r.is_ip);
        assert_eq!(r.domain, None);
    }
}
