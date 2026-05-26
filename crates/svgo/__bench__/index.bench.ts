import { bench, describe } from 'vitest'
import { optimize as ours } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmOurs: typeof ours | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_svgo_wasm.js')
  wasmOurs = mod.optimize
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import { optimize as upstream } from 'svgo'

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <!-- Figma export -->
  <metadata>exported by Figma 2026</metadata>
  <title>Icon</title>
  <g id="Layer_1">
    <path d="M12 2L2 22h20L12 2z" fill="black" stroke="rgb(255,0,0)" display="block"/>
  </g>
</svg>`

const MEDIUM = (() => {
  const paths = Array.from(
    { length: 50 },
    (_, i) =>
      `<path d="M${i}.00000 ${i * 2}.00000 L${i * 3}.00000 ${i * 4}.00000" fill="rgb(255, 0, 0)" stroke="black"/>`,
  ).join('')
  return `<svg viewBox="0 0 100 100"><!-- big --><metadata>m</metadata><g>${paths}</g></svg>`
})()

describe('icon (~200 bytes)', () => {
  bench('@amigo-labs/svgo (napi)', () => {
    ours(ICON)
  })
  if (wasmOurs) bench('@amigo-labs/svgo (wasm)', () => { wasmOurs!(ICON) })
  bench('svgo', () => {
    upstream(ICON, { multipass: false })
  })
})

describe('medium (~5 KB, 50 paths)', () => {
  bench('@amigo-labs/svgo (napi)', () => {
    ours(MEDIUM)
  })
  if (wasmOurs) bench('@amigo-labs/svgo (wasm)', () => { wasmOurs!(MEDIUM) })
  bench('svgo', () => {
    upstream(MEDIUM, { multipass: false })
  })
})
