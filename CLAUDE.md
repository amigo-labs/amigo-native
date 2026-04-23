# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Language

All repository content — documentation, code comments, commit messages, PR
descriptions, and perf-review / post-mortem documents — must be written in
**English**. This applies to every file under `docs/`, every crate
`README.md`, `BACKLOG.md`, `CONTRIBUTING.md`, and all source-code comments.

Non-English strings are only allowed when they are deliberate test fixtures
for Unicode handling (e.g. `"Schöne Grüße"` in a slugify test, `"café"` in
an encoding test). Those are data, not prose, and should stay as-is.

When adding new documentation or translating existing content, keep the
tone and formatting consistent with the surrounding English text.
