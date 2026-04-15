# @amigo-labs/csv

Blazing fast CSV parsing and serialization powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [csv](https://crates.io/crates/csv) crate.

## Installation

```bash
npm install @amigo-labs/csv
```

## Usage

```ts
import { parse, parseWithHeaders, stringify } from "@amigo-labs/csv";

// Parse CSV to arrays
const rows = parse(Buffer.from("name,age\nAlice,30\nBob,25"));
// [["name", "age"], ["Alice", "30"], ["Bob", "25"]]

// Parse CSV to objects (using first row as headers)
const objects = parseWithHeaders(Buffer.from("name,age\nAlice,30\nBob,25"));
// [{ name: "Alice", age: "30" }, { name: "Bob", age: "25" }]

// Serialize arrays to CSV
const csv = stringify([["name", "age"], ["Alice", "30"]]);
// "name,age\nAlice,30\n"
```

## API

### `parse(input, options?): string[][]`

Parses CSV into an array of string arrays.

### `parseWithHeaders(input, options?): Record<string, string>[]`

Parses CSV using the first row as column headers, returning an array of objects.

### `parseToJson(input, options?): string`

Parses CSV and returns a flat JSON string. Avoids per-row FFI overhead. Use `JSON.parse()` on the result.

### `countRows(input, options?): number`

Counts rows without building JS arrays.

### `stringify(rows, options?): string`

Serializes an array of string arrays to CSV.

### `stringifyObjects(rows, columns?, options?): string`

Serializes an array of objects to CSV. Optionally specify column order.

### Options

| Option | Type | Description |
| --- | --- | --- |
| `delimiter` | `number` | Field delimiter byte (default: `,`) |
| `hasHeaders` | `boolean` | Whether the first row is a header row (default: `true`) |
| `quoteChar` | `number` | Quote character byte (default: `"`) |
| `escapeChar` | `number` | Escape character byte |
| `comment` | `number` | Comment prefix byte |
| `flexible` | `boolean` | Allow records with varying field counts |
| `trimFields` | `boolean` | Trim whitespace from fields |

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
