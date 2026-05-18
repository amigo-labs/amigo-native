/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  categories,
  categoryChipClasses,
  categoryLabel,
  categorySolidClasses,
  type Category,
} from "~/lib/packages";

interface Props {
  /** Selector that matches the package-card anchors to filter. */
  cardSelector?: string;
  /** Selector for the catalog section as a whole (used to focus on apply). */
  catalogSelector?: string;
  /** Total package count for the "showing N of M" line. */
  total: number;
}

const ALL = "all" as const;
type Filter = typeof ALL | Category;
type TargetsFilter = typeof ALL | "dual" | "node-only";

export default function CategoryFilter({
  cardSelector = "[data-pkg-card]",
  catalogSelector = "#catalog",
  total,
}: Props) {
  const [filter, setFilter] = useState<Filter>(ALL);
  const [targets, setTargets] = useState<TargetsFilter>(ALL);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(total);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Apply category + targets + search filter to DOM on every change.
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(cardSelector);
    const q = query.trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const cat = card.dataset.category ?? "";
      const cardTargets = (card.dataset.targets ?? "").split(/\s+/);
      const isDual = cardTargets.includes("browser");
      const name = (card.dataset.name ?? "").toLowerCase();
      const title = card.dataset.title ?? "";
      const desc = card.dataset.description ?? "";
      const matchesCat = filter === ALL || cat === filter;
      const matchesTargets =
        targets === ALL ||
        (targets === "dual" && isDual) ||
        (targets === "node-only" && !isDual);
      const matchesQuery =
        !q || name.includes(q) || title.includes(q) || desc.includes(q);
      const show = matchesCat && matchesTargets && matchesQuery;
      card.style.display = show ? "" : "none";
      if (show) shown++;
    });
    setVisible(shown);

    // Hide the section header for any category whose cards are all filtered
    // out. Otherwise we render a "TEXT · 10" heading with nothing beneath it.
    document
      .querySelectorAll<HTMLElement>("[data-category-group]")
      .forEach((group) => {
        const anyVisible = Array.from(
          group.querySelectorAll<HTMLElement>(cardSelector)
        ).some((card) => card.style.display !== "none");
        group.style.display = anyVisible ? "" : "none";
      });
  }, [filter, targets, query, cardSelector]);

  // "/" focuses the search input from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filters = useMemo<{ value: Filter; label: string }[]>(
    () => [
      { value: ALL, label: "All" },
      ...categories.map((c) => ({ value: c, label: categoryLabel[c] })),
    ],
    []
  );

  const targetFilters: { value: TargetsFilter; label: string }[] = [
    { value: ALL, label: "All targets" },
    { value: "dual", label: "Node + Browser" },
    { value: "node-only", label: "Node only" },
  ];

  function clear() {
    setQuery("");
    setFilter(ALL);
    setTargets(ALL);
    inputRef.current?.focus();
  }

  const chipBase =
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors";

  // Category chips: each category carries its own hue. Inactive = tinted
  // outline; active = solid fill so the current selection pops.
  function categoryChip(active: boolean, cat: Category | typeof ALL): string {
    if (cat === ALL) {
      return `${chipBase} ${
        active
          ? "border-accent bg-accent text-accent-on font-semibold shadow-sm"
          : "border-line-strong bg-bg-elevated text-fg font-medium hover:border-accent/60 hover:text-accent"
      }`;
    }
    return `${chipBase} font-medium ${
      active
        ? `${categorySolidClasses[cat]} font-semibold shadow-sm`
        : categoryChipClasses[cat]
    }`;
  }

  // Targets chips: reuse the same green / gray semantics as the per-card
  // TargetsPill so the colours teach a consistent visual vocabulary.
  function targetsChip(active: boolean, value: TargetsFilter): string {
    if (value === ALL) {
      return `${chipBase} ${
        active
          ? "border-accent bg-accent text-accent-on font-semibold shadow-sm"
          : "border-line-strong bg-bg-elevated text-fg font-medium hover:border-accent/60 hover:text-accent"
      }`;
    }
    const tone =
      value === "dual"
        ? {
            inactive: "border-ok/40 bg-ok/10 text-ok hover:bg-ok/20",
            active: "border-ok bg-ok text-bg font-semibold shadow-sm",
          }
        : {
            inactive:
              "border-archived/50 bg-archived/15 text-fg-muted hover:bg-archived/25",
            active:
              "border-archived bg-archived text-bg font-semibold shadow-sm",
          };
    return `${chipBase} ${active ? tone.active : tone.inactive}`;
  }

  const dirty = query !== "" || filter !== ALL || targets !== ALL;

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label class="relative w-full sm:max-w-xs">
          <span class="sr-only">Filter packages</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            placeholder="Filter packages…"
            aria-label="Filter packages"
            class="h-10 w-full rounded-md border border-line bg-bg-elevated pl-9 pr-9 text-sm placeholder:text-fg-subtle focus:border-line-strong"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <kbd
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-2xs text-fg-subtle"
          >
            /
          </kbd>
        </label>
        <div
          aria-live="polite"
          class="font-mono text-2xs uppercase tracking-(--tracking-wide) text-fg-subtle"
        >
          showing {visible} of {total}
          {dirty && (
            <button
              type="button"
              onClick={clear}
              class="ms-3 text-accent hover:text-accent-hot"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {filters.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(f.value);
                document
                  .querySelector(catalogSelector)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              class={categoryChip(active, f.value)}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div
        class="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter by bundler target"
      >
        <span class="font-mono text-2xs uppercase tracking-(--tracking-wide) text-fg-subtle">
          Targets
        </span>
        {targetFilters.map((t) => {
          const active = t.value === targets;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => setTargets(t.value)}
              class={targetsChip(active, t.value)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
