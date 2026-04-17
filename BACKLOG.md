# Backlog — Maybe in Future

Packages considered in earlier planning iterations and ruled out for now due to parity risk, excessive scope, or insufficient payoff. Any of these can be re-evaluated later if the calculus changes.

## Parity too expensive

- **js-yaml** (156M downloads). Spec-compliant YAML parity via `saphyr` is realistic, but `js-yaml` has years of legacy custom tags and Ruby Psych compat quirks. Could ship as a "CommonMark-YAML" alternative — not as a drop-in.
- **ajv** / **json-schema** (ajv ~40M). `ajv` is codegen-based; Rust `jsonschema` is a spec interpreter. Two different philosophies, not a port.
- **tough-cookie** (157M). Browser-compat quirks + Public Suffix List + cookie-jar state. Easily a month-long project.
- **handlebars** (35M). `handlebars-rust` ships with documented divergences; helper callbacks across the FFI boundary would be expensive.
- **parse5** / **htmlparser2** (combined 192M). `html5ever` is excellent, but reaching `parse5`-level error-recovery parity plus two separate adapter APIs is too much.
- **marked** (~30M). `marked`'s GFM interpretation ≠ `pulldown-cmark`'s GFM.

## Scope too large

- **jsdom** (76M). Browser-API surface is gigantic.
- **ws** (204M). Integrating a WebSocket implementation into the NAPI event loop is hard.

## FFI overhead > gain

- **mime** / **mime-types** (combined 343M). Pure hashmap lookups in JS — calling through NAPI would be slower than the JS baseline.
- **dotenv** (91M). Parser is ~50 lines of JS.
- **cosmiconfig** (143M). Mostly filesystem I/O, not CPU.

## Needs a JS engine

- **ejs** (39M). Executes embedded JS code at render time — not feasible without a QuickJS-style integration.

## Deprecated / superseded

- `moment`, `request`, `core-js`, `har-validator`. Don't touch.
