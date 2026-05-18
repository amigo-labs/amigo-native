// Build-time markdown → HTML renderer for the framework docs
// (docs/BASELINE.md, docs/perf-review.md). The per-package readmes and
// perf-reviews are rendered upstream by scripts/render-*.mjs against
// @amigo-labs/commonmark and consumed via lib/content.ts.

import { Marked, type Tokens } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: false,
});

const renderer = new marked.Renderer();

// Inject heading ids matching the slug pattern used elsewhere on the site.
// The allowlist below permits only Unicode letters, numbers, whitespace,
// and hyphens — so the ids never carry attribute-breaking characters.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Walk the marked token tree to recover plain heading text. Slugifying the
// rendered HTML would leak inline tag names (e.g. "code", "strong") into
// the id when a heading contains `<code>` / `<strong>` children.
function tokensToText(tokens: Tokens.Generic[] | undefined): string {
  if (!tokens) return "";
  let out = "";
  for (const tok of tokens) {
    if ("tokens" in tok && Array.isArray(tok.tokens)) {
      out += tokensToText(tok.tokens as Tokens.Generic[]);
    } else if (typeof (tok as Tokens.Text).text === "string") {
      out += (tok as Tokens.Text).text;
    }
  }
  return out;
}

renderer.heading = function ({ tokens, depth }) {
  const html = this.parser.parseInline(tokens);
  const id = slugify(tokensToText(tokens));
  return `<h${depth} id="${id}">${html}</h${depth}>`;
};

marked.use({ renderer });

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string;
}
