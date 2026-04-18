# Candidate review: `{{NAME}}`

> **Status:** {{RECOMMENDATION}} · **Predicted:** {{CLASSIFICATION}} · **Reviewed:** {{DATE}}

## Verdict

{{ONE_SENTENCE_VERDICT}}

## JS package

- **npm:** {{NPM_PACKAGE}}
- **Downloads:** {{NPM_DOWNLOADS}}
- **Exports / API surface:** {{JS_API_SURFACE}}
- **Typical input:** {{TYPICAL_INPUT}}
- **Typical output:** {{TYPICAL_OUTPUT}}
- **Realistic median use-case:** {{MEDIAN_USE_CASE}}

## Rust replacement

- **Candidate crate(s):** {{RUST_CRATES}}
- **Maintenance / license:** {{RUST_MAINTENANCE}}
- **Known gotchas / divergences:** {{RUST_CAVEATS}}

## BACKLOG check

{{BACKLOG_NOTE}}

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | {{ALGO_WORK}} |
| Input size distribution | {{INPUT_DISTRIBUTION}} |
| Output size distribution | {{OUTPUT_DISTRIBUTION}} |
| Reusable setup (stateful potential) | {{STATEFUL_POTENTIAL}} |
| Batch-usage realism | {{BATCH_REALISM}} |
| FFI-share estimate vs. Rust work | {{FFI_SHARE_ESTIMATE}} |

## Classification reasoning

{{RATIONALE_PROSE}}

Reference patterns from the post-mortem: a shape that resembles `nanoid` / `mime` / `deep-equal` (small input, trivial per-call work, FFI dominates) trends Red/Black. A shape that resembles `jwt` / `inflate` / `sanitize-html` (substantial compute, bytes-in/bytes-out, streaming) trends Green.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/{{CRATE_NAME}}`
- **Primary API sketch:**
  ```ts
  {{API_SKETCH}}
  ```
- **Must-have benchmark scenarios:**
  {{REQUIRED_BENCHMARKS}}
- **Acceptance thresholds (Green gate):** {{GREEN_GATE}}
- **Risks:** {{RISKS}}

## If NO-GO — BACKLOG entry

```markdown
{{BACKLOG_SNIPPET}}
```

Section in `BACKLOG.md`: **{{BACKLOG_SECTION}}**
