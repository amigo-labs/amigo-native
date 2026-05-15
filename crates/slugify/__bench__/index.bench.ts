import { bench, describe } from 'vitest'
import { slugify as amigoSlugify } from '../index.js'
import jsSlugify from 'slugify'

// Direct import of the WASM artifact. In a real browser consumer the
// conditional export "./wasm/pkg/amigo_slugify_wasm.js" is selected by
// the bundler; here we bypass conditions to compare in one Node run.
// @ts-expect-error — wasm-pack output has no Node-resolvable type entry from this side
import { slugify as wasmSlugify } from '../wasm/pkg/amigo_slugify_wasm.js'

const shortAscii = 'Hello World 2024!'
const longAscii =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit.'
const unicodeHeavy =
  'Ärger über Übel — café résumé naïve 日本語テスト العربية Ñoño crème brûlée Cześć Łódź Москва κόσμε'

describe('slugify - short ASCII (20 chars)', () => {
  bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(shortAscii)
  })

  bench('@amigo-labs/slugify (wasm)', () => {
    wasmSlugify(shortAscii)
  })

  bench('slugify (npm)', () => {
    jsSlugify(shortAscii, { lower: true, strict: true })
  })
})

describe('slugify - long ASCII (500 chars)', () => {
  bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(longAscii)
  })

  bench('@amigo-labs/slugify (wasm)', () => {
    wasmSlugify(longAscii)
  })

  bench('slugify (npm)', () => {
    jsSlugify(longAscii, { lower: true, strict: true })
  })
})

describe('slugify - unicode heavy', () => {
  bench('@amigo-labs/slugify (napi)', () => {
    amigoSlugify(unicodeHeavy)
  })

  bench('@amigo-labs/slugify (wasm)', () => {
    wasmSlugify(unicodeHeavy)
  })

  bench('slugify (npm)', () => {
    jsSlugify(unicodeHeavy, { lower: true, strict: true })
  })
})
