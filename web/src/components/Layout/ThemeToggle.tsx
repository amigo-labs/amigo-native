/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { readTheme, writeTheme, type Theme } from "~/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    writeTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${next} theme` : "Toggle theme"}
      title={mounted ? `Switch to ${next} theme` : "Toggle theme"}
      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg transition-colors"
    >
      {/* Sun (visible in dark mode) */}
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
        class={theme === "dark" ? "block" : "hidden"}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      {/* Moon (visible in light mode) */}
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
        class={theme === "light" ? "block" : "hidden"}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    </button>
  );
}
