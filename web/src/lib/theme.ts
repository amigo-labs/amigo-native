// Inlined as a blocking <script is:inline> in Base.astro <head>. Sets the
// document theme before first paint so there is no flash. Reads localStorage
// first, then falls back to prefers-color-scheme.

export const themeBootstrap = `;(function () {
  try {
    var stored = localStorage.getItem('amigo-theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();`;

export type Theme = "dark" | "light";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return (document.documentElement.dataset.theme as Theme) ?? "dark";
}

export function writeTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("amigo-theme", theme);
  } catch {
    // ignore — Safari private mode, etc.
  }
}
