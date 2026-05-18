// Global keyboard shortcuts for the landing page. Mirrors the muscle memory
// of the legacy vanilla site:
//
//   /           focus the search input
//   ↑ / ↓       move focus across package cards
//   Home / End  jump to first / last card
//   Enter       open the focused card (browser default — no handler needed)
//   c           copy the install command of the focused card to clipboard
//   t           toggle the theme
//   g p         go to the catalog (#catalog)
//   g c         go to /changelog
//   ?           show the shortcut overlay
//
// Imported as a side-effect from src/pages/index.astro.

import { readTheme, writeTheme } from "./theme";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

function packageCards(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-pkg-card]")
  ).filter((el) => el.offsetParent !== null);
}

function indexOf(el: Element | null, cards: HTMLElement[]): number {
  if (!el) return -1;
  return cards.findIndex((c) => c === el || c.contains(el));
}

function focusCard(idx: number, cards: HTMLElement[]): void {
  if (cards.length === 0) return;
  const wrapped = ((idx % cards.length) + cards.length) % cards.length;
  cards[wrapped]?.focus();
  cards[wrapped]?.scrollIntoView({ block: "nearest" });
}

async function copyInstallFor(card: HTMLElement | null): Promise<void> {
  const name = card?.dataset.name;
  if (!name) return;
  const text = `pnpm add @amigo-labs/${name}`;
  try {
    await navigator.clipboard.writeText(text);
    flash(card, "Copied");
  } catch {
    flash(card, "Copy blocked");
  }
}

function flash(host: HTMLElement | null, label: string): void {
  if (!host) return;
  const badge = document.createElement("span");
  badge.textContent = label;
  badge.setAttribute("role", "status");
  badge.style.cssText = `
    position: absolute; inset-block-start: 8px; inset-inline-end: 8px;
    background: var(--accent); color: var(--accent-on);
    font: 500 11px/1 var(--font-mono); padding: 2px 6px; border-radius: 4px;
    pointer-events: none;
  `;
  const parent = host;
  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }
  parent.appendChild(badge);
  setTimeout(() => badge.remove(), 1100);
}

function showOverlay(): void {
  let overlay = document.getElementById("shortcut-overlay");
  if (overlay) {
    overlay.remove();
    return;
  }
  overlay = document.createElement("div");
  overlay.id = "shortcut-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Keyboard shortcuts");
  overlay.innerHTML = `
    <div class="overlay-backdrop"></div>
    <div class="overlay-panel">
      <h2>Keyboard shortcuts</h2>
      <dl>
        <div><dt><kbd>/</kbd></dt><dd>Filter packages</dd></div>
        <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move between cards</dd></div>
        <div><dt><kbd>Home</kbd> <kbd>End</kbd></dt><dd>First / last card</dd></div>
        <div><dt><kbd>Enter</kbd></dt><dd>Open focused package</dd></div>
        <div><dt><kbd>c</kbd></dt><dd>Copy install command</dd></div>
        <div><dt><kbd>t</kbd></dt><dd>Toggle theme</dd></div>
        <div><dt><kbd>g</kbd> <kbd>p</kbd></dt><dd>Go to packages</dd></div>
        <div><dt><kbd>g</kbd> <kbd>c</kbd></dt><dd>Go to changelog</dd></div>
        <div><dt><kbd>?</kbd></dt><dd>Toggle this overlay</dd></div>
        <div><dt><kbd>Esc</kbd></dt><dd>Close this overlay</dd></div>
      </dl>
      <button type="button" data-overlay-close>Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLElement>("[data-overlay-close]")?.focus();
  overlay
    .querySelectorAll<HTMLElement>(".overlay-backdrop, [data-overlay-close]")
    .forEach((el) => el.addEventListener("click", () => overlay?.remove()));
}

function closeOverlay(): boolean {
  const overlay = document.getElementById("shortcut-overlay");
  if (!overlay) return false;
  overlay.remove();
  return true;
}

export function installKeyboardShortcuts(): void {
  let gPrefix = false;
  let gTimer: ReturnType<typeof setTimeout> | null = null;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (closeOverlay()) {
        e.preventDefault();
        return;
      }
    }

    if (isTypingTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (gPrefix) {
      if (e.key === "p") {
        e.preventDefault();
        document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
      } else if (e.key === "c") {
        e.preventDefault();
        window.location.href = "/changelog";
      }
      gPrefix = false;
      if (gTimer) clearTimeout(gTimer);
      return;
    }

    const cards = packageCards();
    const cur = indexOf(document.activeElement, cards);

    switch (e.key) {
      case "ArrowDown": {
        if (cards.length) {
          e.preventDefault();
          focusCard(cur < 0 ? 0 : cur + 1, cards);
        }
        break;
      }
      case "ArrowUp": {
        if (cards.length) {
          e.preventDefault();
          focusCard(cur < 0 ? cards.length - 1 : cur - 1, cards);
        }
        break;
      }
      case "Home": {
        if (cards.length) {
          e.preventDefault();
          focusCard(0, cards);
        }
        break;
      }
      case "End": {
        if (cards.length) {
          e.preventDefault();
          focusCard(cards.length - 1, cards);
        }
        break;
      }
      case "c": {
        if (cur >= 0) {
          e.preventDefault();
          void copyInstallFor(cards[cur] ?? null);
        }
        break;
      }
      case "t": {
        e.preventDefault();
        // writeTheme already dispatches amigo:theme-changed, so any
        // ThemeToggle island on the page re-renders its icon.
        writeTheme(readTheme() === "dark" ? "light" : "dark");
        break;
      }
      case "g": {
        gPrefix = true;
        gTimer = setTimeout(() => {
          gPrefix = false;
        }, 800);
        break;
      }
      case "?": {
        e.preventDefault();
        showOverlay();
        break;
      }
    }
  });
}
