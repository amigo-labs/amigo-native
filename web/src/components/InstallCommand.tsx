/** @jsxImportSource preact */
import { useState } from "preact/hooks";

type Manager = "pnpm" | "npm" | "yarn" | "bun";

const MANAGERS: { id: Manager; label: string; cmd: (pkg: string) => string }[] = [
  { id: "pnpm", label: "pnpm", cmd: (p) => `pnpm add ${p}` },
  { id: "npm", label: "npm", cmd: (p) => `npm install ${p}` },
  { id: "yarn", label: "yarn", cmd: (p) => `yarn add ${p}` },
  { id: "bun", label: "bun", cmd: (p) => `bun add ${p}` },
];

interface Props {
  pkg: string;
}

export default function InstallCommand({ pkg }: Props) {
  const [active, setActive] = useState<Manager>("pnpm");
  const [copied, setCopied] = useState(false);

  const current = MANAGERS.find((m) => m.id === active)!;
  const cmd = current.cmd(pkg);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      // ignore — old browsers
    }
  }

  return (
    <div class="rounded-xl border border-line bg-bg-elevated">
      <div class="flex items-center gap-1 border-b border-line px-2 py-1.5">
        {MANAGERS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={active === m.id}
            onClick={() => setActive(m.id)}
            class={`h-7 rounded px-2.5 font-mono text-xs transition-colors ${
              active === m.id
                ? "bg-bg text-fg"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {m.label}
          </button>
        ))}
        <div class="ms-auto">
          <button
            type="button"
            onClick={copy}
            aria-label="Copy install command"
            class="inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs text-fg-muted hover:text-fg"
          >
            {copied ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span class="font-mono">Copied</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span class="font-mono">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre class="overflow-x-auto px-4 py-3 font-mono text-sm text-fg">
        <code>{cmd}</code>
      </pre>
    </div>
  );
}
