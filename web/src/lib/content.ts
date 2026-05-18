// Build-time loaders for the prerendered HTML cached under docs/.
// Each glob runs at build, so missing entries yield undefined and we can
// degrade gracefully on the page.

type Loader = () => Promise<string>;

const readmes = import.meta.glob<string>(
  "../../../docs/readmes/*.html",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

const perfReviews = import.meta.glob<string>(
  "../../../docs/perf-review/*.html",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

const postMortems = import.meta.glob<string>(
  "../../../docs/post-mortems/*.md",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

const histories = import.meta.glob<string>(
  "../../../docs/history/*.jsonl",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

const topLevelDocs = import.meta.glob<string>(
  "../../../docs/*.md",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

function pick(map: Record<string, Loader>, suffix: string): Loader | undefined {
  const key = Object.keys(map).find((k) => k.endsWith(suffix));
  return key ? map[key] : undefined;
}

export async function loadReadme(slug: string): Promise<string | null> {
  const loader = pick(readmes, `/readmes/${slug}.html`);
  return loader ? await loader() : null;
}

export async function loadPerfReview(slug: string): Promise<string | null> {
  const loader = pick(perfReviews, `/perf-review/${slug}.html`);
  return loader ? await loader() : null;
}

export async function loadPostMortem(slug: string): Promise<string | null> {
  const loader = pick(postMortems, `/post-mortems/${slug}.md`);
  return loader ? await loader() : null;
}

export async function loadTopLevelDoc(basename: string): Promise<string | null> {
  const loader = pick(topLevelDocs, `/docs/${basename}.md`);
  return loader ? await loader() : null;
}

export interface HistoryRow {
  commit: string;
  date: string;
  runner?: string;
  node?: string;
  suites: { name: string; amigo: number; best_competitor: number | null; ratio: number | null }[];
}

export async function loadHistory(slug: string): Promise<HistoryRow[]> {
  const loader = pick(histories, `/history/${slug}.jsonl`);
  if (!loader) return [];
  const text = await loader();
  const rows: HistoryRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as HistoryRow);
    } catch {
      // skip malformed line
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// Parse the verdict status out of the prerendered perf-review HTML. The
// rendered shape is stable: a <blockquote> whose first <p> reads
// "<strong>Status:</strong> 🟢 Green · <strong>Reviewed:</strong> …".
export type Verdict = "green" | "yellow" | "red" | "black" | "archived";

export interface PerfMeta {
  verdict: Verdict | null;
  verdictLabel: string | null;
  reviewedOn: string | null;
  version: string | null;
}

const VERDICT_PATTERNS: { token: string; verdict: Verdict; label: string }[] = [
  { token: "🟢", verdict: "green", label: "Green" },
  { token: "🟡", verdict: "yellow", label: "Yellow" },
  { token: "🔴", verdict: "red", label: "Red" },
  { token: "⚫", verdict: "black", label: "Black" },
  { token: "📦", verdict: "archived", label: "Archived" },
];

// Capture the text between the rendered "<strong>Status:</strong>" label
// and either the next inline label ("Reviewed:" / "Version:") or the end of
// the surrounding paragraph. Anything else in the document body — perf
// rubric explainers, verdict tables, etc. — is intentionally ignored.
const STATUS_LINE = /Status:\s*<\/strong>\s*([\s\S]*?)(?:<strong>|<\/p>|$)/i;

export function extractPerfMeta(html: string | null): PerfMeta {
  const empty: PerfMeta = {
    verdict: null,
    verdictLabel: null,
    reviewedOn: null,
    version: null,
  };
  if (!html) return empty;

  const statusFragment = STATUS_LINE.exec(html)?.[1] ?? "";

  let verdict: Verdict | null = null;
  let verdictLabel: string | null = null;
  // Pick the first verdict emoji that appears in the status fragment so
  // packages like inflate (which carries "🟡 Yellow / 🟢 Green-likely
  // post-Phase-C" on the same line) still surface the official label.
  let earliest = Number.POSITIVE_INFINITY;
  for (const p of VERDICT_PATTERNS) {
    const idx = statusFragment.indexOf(p.token);
    if (idx >= 0 && idx < earliest) {
      earliest = idx;
      verdict = p.verdict;
      verdictLabel = p.label;
    }
  }

  const reviewedMatch = /Reviewed:\s*<\/strong>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(
    html
  );
  const versionMatch = /Version:\s*<\/strong>\s*([\w.\-+]+)/.exec(html);

  return {
    verdict,
    verdictLabel,
    reviewedOn: reviewedMatch?.[1] ?? null,
    version: versionMatch?.[1] ?? null,
  };
}
