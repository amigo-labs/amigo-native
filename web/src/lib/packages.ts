// Typed access to docs/packages.json — the single source of truth for the
// package catalog, hero copy, and marquee stats. The JSON file is regenerated
// by scripts/run-benchmarks.mjs and consumed at build time by Astro pages.

import raw from "@data/packages.json";

export type Category =
  | "crypto"
  | "text"
  | "search"
  | "document"
  | "archive"
  | "util"
  | "graph";

export type Target = "node" | "browser";

/** Per-tier speedup payload emitted by `scripts/generate-report.mjs#computeSpeedupDetails`.
 *  `vsJs` is the median ratio of amigo hz vs. best competitor hz; `hz` is the
 *  geometric-mean throughput across the crate's suites — useful as a single
 *  absolute number when sizing a badge. */
export interface TierSpeedup {
  label: string;
  hz: number | null;
  vsJs: number;
}

export interface SpeedupDetails {
  napi?: TierSpeedup;
  wasm?: TierSpeedup;
}

export interface Pkg {
  name: string;
  title: string;
  category: Category;
  description: string;
  /** Legacy single-string field — prefers the napi tier, falls back to wasm
   *  or to the pre-Phase-3 algorithm for crates whose benches don't yet
   *  carry the `(napi)` / `(wasm)` suffix. */
  speedup: string;
  /** Per-tier breakdown when the bench file produced both `(napi)` and
   *  `(wasm)` entries. Absent for Node-only crates and for legacy benches. */
  speedupDetails?: SpeedupDetails;
  /** Bundler-target capability. `["node"]` means the package ships only the
   * napi binary (server-only tier); `["node", "browser"]` means it also
   * carries a WASM build picked up via package.json conditional exports. */
  targets: Target[];
  npmUrl: string;
  sourceUrl: string;
  readmeUrl?: string;
  perfReviewUrl?: string;
}

export function isDualTarget(pkg: Pkg): boolean {
  return pkg.targets.includes("browser");
}

export interface MarqueeStat {
  k: string;
  v: string;
}

export interface Brand {
  name: string;
  tagline: string;
  subline: string;
  repo: string;
  repoUrl: string;
  license: string;
}

interface Catalog {
  brand: Brand;
  heroTaglines: string[];
  marquee: MarqueeStat[];
  packages: Pkg[];
}

const catalog = raw as unknown as Catalog;

export const brand: Brand = catalog.brand;
export const heroTaglines: string[] = catalog.heroTaglines;
export const marquee: MarqueeStat[] = catalog.marquee;
export const packages: Pkg[] = catalog.packages;

export const categories: Category[] = [
  "crypto",
  "text",
  "search",
  "document",
  "archive",
  "util",
  "graph",
];

export const categoryLabel: Record<Category, string> = {
  crypto: "Crypto",
  text: "Text",
  search: "Search",
  document: "Document",
  archive: "Archive",
  util: "Util",
  graph: "Graph",
};

/**
 * Tailwind class fragments per category. `chip` is the bordered/tinted state
 * for inactive filter chips and catalog category labels; `solid` is the
 * filled state for the active filter chip. Each pair targets the matching
 * --cat-<name> token from web/src/styles/tokens.css.
 */
export const categoryChipClasses: Record<Category, string> = {
  crypto:
    "border-cat-crypto/70 bg-cat-crypto/20 text-cat-crypto hover:bg-cat-crypto/30",
  text: "border-cat-text/70 bg-cat-text/20 text-cat-text hover:bg-cat-text/30",
  search:
    "border-cat-search/70 bg-cat-search/20 text-cat-search hover:bg-cat-search/30",
  document:
    "border-cat-document/70 bg-cat-document/20 text-cat-document hover:bg-cat-document/30",
  archive:
    "border-cat-archive/70 bg-cat-archive/20 text-cat-archive hover:bg-cat-archive/30",
  util: "border-cat-util/70 bg-cat-util/20 text-cat-util hover:bg-cat-util/30",
  graph:
    "border-cat-graph/70 bg-cat-graph/20 text-cat-graph hover:bg-cat-graph/30",
};

export const categorySolidClasses: Record<Category, string> = {
  crypto: "border-cat-crypto bg-cat-crypto text-bg",
  text: "border-cat-text bg-cat-text text-bg",
  search: "border-cat-search bg-cat-search text-bg",
  document: "border-cat-document bg-cat-document text-bg",
  archive: "border-cat-archive bg-cat-archive text-bg",
  util: "border-cat-util bg-cat-util text-bg",
  graph: "border-cat-graph bg-cat-graph text-bg",
};

export function packageBySlug(slug: string): Pkg | undefined {
  return packages.find((p) => p.name === slug);
}

export function packagesByCategory(cat: Category): Pkg[] {
  return packages.filter((p) => p.category === cat);
}
