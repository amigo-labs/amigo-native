/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";

interface NavItem {
  label: string;
  href: string;
}

interface Props {
  nav: NavItem[];
  repoUrl: string;
  currentPath: string;
}

export default function MobileDrawer({ nav, repoUrl, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Move focus into the panel.
    const first = panelRef.current?.querySelector<HTMLElement>(
      "a, button, [tabindex]:not([tabindex='-1'])"
    );
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-bg-elevated text-fg-muted hover:border-line-strong hover:text-fg transition-colors md:hidden"
      >
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
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          class="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            id="mobile-drawer"
            style={{ background: "var(--bg)" }}
            class="absolute right-0 top-0 h-full w-[320px] max-w-[100vw] border-l border-line shadow-pop px-5 pt-5 pb-8 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between pb-4 mb-2 border-b border-line">
              <span class="font-mono text-xs uppercase tracking-(--tracking-wide) text-fg-subtle">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg"
              >
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
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav class="flex flex-col gap-1" aria-label="Mobile">
              {nav.map((item) => {
                const isCurrent =
                  item.href === currentPath ||
                  (item.href !== "/" && currentPath.startsWith(item.href));
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    class={`flex min-h-11 items-center rounded-md px-3 text-md font-medium transition-colors ${
                      isCurrent
                        ? "bg-accent-dim text-accent"
                        : "text-fg-muted hover:bg-bg hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <div class="mt-auto pt-4 border-t border-line">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-fg-muted hover:text-fg"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-2.04c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.52-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.73.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
