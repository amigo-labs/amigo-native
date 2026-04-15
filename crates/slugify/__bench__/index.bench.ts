import { bench, describe } from 'vitest'
import { slugify as amigoSlugify } from '../index.js'
import jsSlugify from 'slugify'

const shortAscii = 'Hello World 2024!'
const longAscii =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit.'
const unicodeHeavy =
  'Ärger über Übel — café résumé naïve 日本語テスト العربية Ñoño crème brûlée Cześć Łódź Москва κόσμε'

describe('slugify - short ASCII (20 chars)', () => {
  bench('@amigo-labs/slugify', () => {
    amigoSlugify(shortAscii)
  })

  bench('slugify (npm)', () => {
    jsSlugify(shortAscii, { lower: true, strict: true })
  })
})

describe('slugify - long ASCII (500 chars)', () => {
  bench('@amigo-labs/slugify', () => {
    amigoSlugify(longAscii)
  })

  bench('slugify (npm)', () => {
    jsSlugify(longAscii, { lower: true, strict: true })
  })
})

describe('slugify - unicode heavy', () => {
  bench('@amigo-labs/slugify', () => {
    amigoSlugify(unicodeHeavy)
  })

  bench('slugify (npm)', () => {
    jsSlugify(unicodeHeavy, { lower: true, strict: true })
  })
})
