//! Per-language abbreviation tables, drawn from the Pragmatic Segmenter
//! reference corpus plus our own additions for common technical text.
//! Lowercase form only.

pub fn for_language(lang: &str) -> &'static [&'static str] {
    match lang {
        "de" => DE,
        "fr" => FR,
        "es" => ES,
        "it" => IT,
        "pt" => PT,
        "nl" => NL,
        _ => EN,
    }
}

const EN: &[&str] = &[
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "no", "vs",
    "etc", "eg", "ie", "ca", "cf", "co", "corp", "inc", "ltd", "gen",
    "rev", "hon", "capt", "cmdr", "col", "cpl", "gov", "lt", "maj",
    "sgt", "pvt", "pres", "supt", "dept", "dist", "natl", "intl",
    "univ", "assn", "bros", "esp", "approx", "misc", "avg", "max",
    "min", "incl", "excl", "apt", "ave", "bldg", "blvd", "ft", "hwy",
    "mt", "rd", "sq", "ste", "yd", "sec", "min", "hr", "vol", "edn",
    "ed", "trans", "viz", "ad", "bc", "ca", "pm", "am",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept",
    "oct", "nov", "dec",
];

const DE: &[&str] = &[
    "hr", "fr", "frl", "dr", "prof", "med", "ggf", "ca", "zb", "dh",
    "bzw", "usw", "etc", "bspw", "evtl", "geb", "gest", "bes", "mfg",
    "mwst", "ust", "bafin", "insb", "inkl", "jh", "jhd", "nr", "tel",
    "tl", "u", "ua", "uva", "ue", "verl", "vgl", "zt", "zzt", "ag",
    "gmbh", "kg", "jan", "feb", "mrz", "apr", "jun", "jul", "aug",
    "sep", "okt", "nov", "dez",
];

const FR: &[&str] = &[
    "m", "mm", "mme", "mlle", "dr", "pr", "st", "ste", "cie", "env",
    "cf", "etc", "ex", "n", "nb", "p", "pp", "vol", "chap", "fig",
    "av", "bd", "janv", "fevr", "fev", "mars", "avr", "mai", "juin",
    "juil", "aout", "sept", "oct", "nov", "dec",
];

const ES: &[&str] = &[
    "sr", "sra", "sres", "sras", "srta", "dr", "dra", "lic", "ing",
    "arq", "ud", "uds", "etc", "av", "avda", "cap", "edo", "depto",
    "no", "pag", "vol", "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
];

const IT: &[&str] = &[
    "sig", "sigg", "ra", "dr", "dott", "ing", "avv", "prof", "arch",
    "rag", "geom", "ecc", "etc", "es", "pag", "cap", "fig", "vol",
    "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set",
    "ott", "nov", "dic",
];

const PT: &[&str] = &[
    "sr", "sra", "srs", "sras", "srta", "dr", "dra", "eng", "arq",
    "exmo", "exma", "etc", "pag", "ref", "jan", "fev", "mar", "abr",
    "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

const NL: &[&str] = &[
    "dhr", "mw", "mej", "dr", "drs", "prof", "ing", "mr", "ir", "bv",
    "nv", "bvba", "enz", "etc", "blz", "jl", "jan", "feb", "mrt",
    "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
];
