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

export interface Pkg {
  name: string;
  title: string;
  category: Category;
  description: string;
  speedup: string;
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

export function packageBySlug(slug: string): Pkg | undefined {
  return packages.find((p) => p.name === slug);
}

export function packagesByCategory(cat: Category): Pkg[] {
  return packages.filter((p) => p.category === cat);
}
