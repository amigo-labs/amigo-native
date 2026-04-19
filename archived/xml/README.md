# @amigo-labs/xml — archived

> 🗄️ **Archived 2026-04-19, never published to npm.** Source removed
> from the tree after the re-review confirmed no viable release path.

Folded up before a first release. `sax` (JS) beats every realistic-
median use case. A 2026-04-19 re-review showed `parseXmlToJson`
returning the event stream as a JSON string wins the 1 KB bucket
(1,55× sax) but loses 100 KB (0,78×) and 10 MB (0,72×). At 10 MB the
bottleneck is JS-side `JSON.parse` of the ~15 MB output — a structural
limit no Rust lever can beat. See
[post-mortem](../../docs/post-mortems/xml.md) and
[perf-review](../../docs/perf-review/xml.md) for the numbers.

**Use instead:** `sax` (streaming) or `fast-xml-parser` (tree).

**Source history:** last full tree at commit `cdade50`
(`archive(xml): move to archived/ — never published, re-review
confirmed Red`).
