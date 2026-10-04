import { test } from 'vitest'
import { slugify as amigoSlugify } from '../index.js'
import jsSlugify from 'slugify'

// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
// In a browser consumer the conditional export
// "./wasm/pkg/amigo_slugify_wasm.js" is selected by the bundler.
let wasmSlugify: ((s: string) => string) | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_slugify_wasm.js')
  wasmSlugify = mod.slugify
} catch {
  console.warn(
    '[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator',
  )
}

const shortAscii = 'Hello World 2024!'
const longAscii =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit.'
const unicodeHeavy =
  'Ärger über Übel — café résumé naïve 日本語テスト العربية Ñoño crème brûlée Cześć Łódź Москва κόσμε'

test('slugify - short ASCII (20 chars)', async ({ bench }) => {
  await bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(shortAscii)
  }).run()

  if (wasmSlugify) {
    await bench('@amigo-labs/slugify (wasm)', () => {
      wasmSlugify!(shortAscii)
    }).run()
  }

  await bench('slugify (npm)', () => {
    jsSlugify(shortAscii, { lower: true, strict: true })
  }).run()
})

test('slugify - long ASCII (500 chars)', async ({ bench }) => {
  await bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(longAscii)
  }).run()

  if (wasmSlugify) {
    await bench('@amigo-labs/slugify (wasm)', () => {
      wasmSlugify!(longAscii)
    }).run()
  }

  await bench('slugify (npm)', () => {
    jsSlugify(longAscii, { lower: true, strict: true })
  }).run()
})

test('slugify - unicode heavy', async ({ bench }) => {
  await bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(unicodeHeavy)
  }).run()

  if (wasmSlugify) {
    await bench('@amigo-labs/slugify (wasm)', () => {
      wasmSlugify!(unicodeHeavy)
    }).run()
  }

  await bench('slugify (npm)', () => {
    jsSlugify(unicodeHeavy, { lower: true, strict: true })
  }).run()
})
