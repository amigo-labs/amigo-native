import { bench, describe } from 'vitest'
import { optimize as ours } from '../index.js'
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
  bench('@amigo-labs/svgo', () => {
    ours(ICON)
  })
  bench('svgo', () => {
    upstream(ICON, { multipass: false })
  })
})

describe('medium (~5 KB, 50 paths)', () => {
  bench('@amigo-labs/svgo', () => {
    ours(MEDIUM)
  })
  bench('svgo', () => {
    upstream(MEDIUM, { multipass: false })
  })
})
