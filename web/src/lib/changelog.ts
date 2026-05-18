// Changelog timeline data sources:
//   1. .release-please-manifest.json — current shipped versions per crate
//   2. docs/post-mortems/*.md — archive narratives for deprecated packages
//
// Both feed into a unified, date-sorted timeline. The post-mortem dates are
// pulled from the markdown body; entries without a parseable date fall back
// to a "deprecated" timeline bucket without a date.

import manifest from "../../../.release-please-manifest.json";
import { packages } from "./packages";

type Loader = () => Promise<string>;

const postMortems = import.meta.glob<string>(
  "../../../docs/post-mortems/*.md",
  { query: "?raw", import: "default" }
) as Record<string, Loader>;

export type EntryType = "release" | "post-mortem";

export interface TimelineEntry {
  type: EntryType;
  date: string | null;
  /** Slug — empty when the entry isn't tied to a specific package. */
  pkg: string;
  /** Display title for the timeline row. */
  title: string;
  /** One-line summary rendered inline. */
  summary: string;
  /** Optional version string for release entries. */
  version?: string;
  /** Optional href to navigate to for more detail. */
  href?: string;
}

const ARCHIVED_DATE = /archived\s+(\d{4}-\d{2}-\d{2})/i;

const STATIC_DEPRECATION_DATES: Record<string, string> = {
  // Sourced from docs/perf-review.md — these two post-mortems do not carry
  // an explicit date line, but the framework doc records when they were
  // archived. Hard-coding the lookup here keeps the timeline coherent.
  "deep-equal": "2026-04-19",
  levenshtein: "2026-04-19",
};

function summariseStatusLine(raw: string): string {
  return raw
    .replace(/^\*\*Status:\*\*\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function loadPostMortems(): Promise<TimelineEntry[]> {
  const out: TimelineEntry[] = [];
  for (const [path, loader] of Object.entries(postMortems)) {
    const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    if (!slug) continue;
    const text = await loader();
    const firstLine = text
      .split("\n")
      .find((l) => l.startsWith("**Status:**"))
      ?.trim();
    const dateMatch = firstLine ? ARCHIVED_DATE.exec(firstLine) : null;
    const date =
      dateMatch?.[1] ?? STATIC_DEPRECATION_DATES[slug] ?? null;
    const summary = firstLine ? summariseStatusLine(firstLine) : "Archived.";
    out.push({
      type: "post-mortem",
      date,
      pkg: slug,
      title: `@amigo-labs/${slug} archived`,
      summary,
      href: `/packages/${slug}`,
    });
  }
  return out;
}

function loadReleases(): TimelineEntry[] {
  const versions = manifest as Record<string, string>;
  const out: TimelineEntry[] = [];
  for (const pkg of packages) {
    const key = `crates/${pkg.name}`;
    const version = versions[key];
    if (!version) continue;
    out.push({
      type: "release",
      date: null, // No tag history yet — render under "latest" bucket.
      pkg: pkg.name,
      title: `@amigo-labs/${pkg.name}`,
      summary: pkg.description,
      version,
      href: `/packages/${pkg.name}`,
    });
  }
  return out;
}

export async function loadTimeline(): Promise<TimelineEntry[]> {
  const [mortems, releases] = await Promise.all([
    loadPostMortems(),
    Promise.resolve(loadReleases()),
  ]);
  return [...mortems, ...releases].sort((a, b) => {
    // Dated entries first, newest at the top.
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}
