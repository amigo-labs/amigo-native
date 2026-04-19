import { bench, describe } from 'vitest'
import { hashSync as amigoHashSync, verifySync as amigoVerifySync } from '../index.js'

// Competitor imports — bcrypt npm needs node-gyp, may not be available
let nodeBcrypt: typeof import('bcrypt') | null = null
let bcryptjs: typeof import('bcryptjs').default | null = null

try {
  nodeBcrypt = await import('bcrypt')
} catch {
  console.warn('bcrypt npm not available (node-gyp build failed?), skipping')
}

try {
  bcryptjs = (await import('bcryptjs')).default
} catch {
  console.warn('bcryptjs not available, skipping')
}

const password = 'benchmark-password-2024'
const LOW_COST = 4 // smallest realistic — keeps bench wall-time sane
const STD_COST = 10 // industry default

// Pre-compute hashes at top level so the conditional `bench()` registrations
// below see real values, not undefined (which silently skips the bench).
const amigoHash = amigoHashSync(password, { cost: STD_COST })
const nodeBcryptHash = nodeBcrypt
  ? await nodeBcrypt.hash(password, STD_COST)
  : undefined
const bcryptjsHash = bcryptjs
  ? await bcryptjs.hash(password, STD_COST)
  : undefined

describe('bcrypt - hash (cost 4, low)', () => {
  bench(
    '@amigo-labs/bcrypt',
    () => {
      amigoHashSync(password, { cost: LOW_COST })
    },
    { time: 5000, iterations: 5, warmupIterations: 1 },
  )

  if (nodeBcrypt) {
    const b = nodeBcrypt
    bench(
      'bcrypt (npm, C++ via node-gyp)',
      async () => {
        await b.hash(password, LOW_COST)
      },
      { time: 5000, iterations: 5, warmupIterations: 1 },
    )
  }

  if (bcryptjs) {
    const b = bcryptjs
    bench(
      'bcryptjs (pure JS)',
      async () => {
        await b.hash(password, LOW_COST)
      },
      { time: 5000, iterations: 5, warmupIterations: 1 },
    )
  }
})

describe('bcrypt - hash (cost 10, industry default)', () => {
  bench(
    '@amigo-labs/bcrypt',
    () => {
      amigoHashSync(password, { cost: STD_COST })
    },
    { time: 10000, iterations: 3, warmupIterations: 1 },
  )

  if (nodeBcrypt) {
    const b = nodeBcrypt
    bench(
      'bcrypt (npm, C++ via node-gyp)',
      async () => {
        await b.hash(password, STD_COST)
      },
      { time: 10000, iterations: 3, warmupIterations: 1 },
    )
  }

  if (bcryptjs) {
    const b = bcryptjs
    bench(
      'bcryptjs (pure JS)',
      async () => {
        await b.hash(password, STD_COST)
      },
      { time: 10000, iterations: 3, warmupIterations: 1 },
    )
  }
})

describe('bcrypt - verify (cost 10)', () => {
  bench(
    '@amigo-labs/bcrypt',
    () => {
      amigoVerifySync(amigoHash, password)
    },
    { time: 10000, iterations: 3, warmupIterations: 1 },
  )

  if (nodeBcrypt && nodeBcryptHash) {
    const b = nodeBcrypt
    const h = nodeBcryptHash
    bench(
      'bcrypt (npm, C++ via node-gyp)',
      async () => {
        await b.compare(password, h)
      },
      { time: 10000, iterations: 3, warmupIterations: 1 },
    )
  }

  if (bcryptjs && bcryptjsHash) {
    const b = bcryptjs
    const h = bcryptjsHash
    bench(
      'bcryptjs (pure JS)',
      async () => {
        await b.compare(password, h)
      },
      { time: 10000, iterations: 3, warmupIterations: 1 },
    )
  }
})
