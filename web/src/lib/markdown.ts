// Build-time markdown → HTML renderer for the framework docs
// (docs/BASELINE.md, docs/perf-review.md). The per-package readmes and
// perf-reviews are rendered upstream by scripts/render-*.mjs against
// @amigo-labs/commonmark and consumed via lib/content.ts.

import { Marked } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: false,
});

const renderer = new marked.Renderer();

// Inject heading ids matching the slug pattern used elsewhere on the site.
// The allowlist below permits only word chars, whitespace, and hyphens —
// which collapses any HTML markup inside a heading (<code>, <strong>, …)
// to its plain-text equivalent without a separate tag-strip pass.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slugify(text);
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};

marked.use({ renderer });

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string;
}
