import { test, beforeAll } from 'vitest'
import { hashSync as amigoHashSync, verifySync as amigoVerifySync } from '../index.js'

// Competitor imports — argon2 npm needs node-gyp, may not be available
let nodeArgon2: typeof import('argon2') | null = null
let hashWasm: typeof import('hash-wasm') | null = null

try {
  nodeArgon2 = await import('argon2')
} catch {
  console.warn('argon2 npm not available (node-gyp build failed?), skipping')
}

try {
  hashWasm = await import('hash-wasm')
} catch {
  console.warn('hash-wasm not available, skipping')
}

const password = 'benchmark-password-2024'
const lowCostOpts = { memoryCost: 4096, timeCost: 2, parallelism: 1 }

// Pre-compute hashes for verify benchmarks
let amigoHash: string
let nodeArgon2Hash: string | undefined

beforeAll(async () => {
  amigoHash = amigoHashSync(password, lowCostOpts)
  if (nodeArgon2) {
    nodeArgon2Hash = await nodeArgon2.hash(password, {
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    })
  }
})

test('argon2 - hash (low-cost)', async ({ bench }) => {
  await bench(
    '@amigo-labs/argon2',
    () => {
      amigoHashSync(password, lowCostOpts)
    },
  ).run({ time: 10000, iterations: 5, warmupIterations: 1 })

  if (nodeArgon2) {
    const argon2 = nodeArgon2
    await bench(
      'argon2 (npm, C-bindings)',
      async () => {
        await argon2.hash(password, {
          memoryCost: 4096,
          timeCost: 2,
          parallelism: 1,
        })
      },
    ).run({ time: 10000, iterations: 5, warmupIterations: 1 })
  }

  if (hashWasm) {
    const hw = hashWasm
    await bench(
      'hash-wasm (WASM)',
      async () => {
        await hw.argon2id({
          password,
          salt: new Uint8Array(16),
          parallelism: 1,
          iterations: 1,
          memorySize: 4096,
          hashLength: 32,
          outputType: 'encoded',
        })
      },
    ).run({ time: 10000, iterations: 5, warmupIterations: 1 })
  }
})

test('argon2 - verify', async ({ bench }) => {
  await bench(
    '@amigo-labs/argon2',
    () => {
      amigoVerifySync(amigoHash, password)
    },
  ).run({ time: 10000, iterations: 5, warmupIterations: 1 })

  if (nodeArgon2 && nodeArgon2Hash) {
    const argon2 = nodeArgon2
    const hash = nodeArgon2Hash
    await bench(
      'argon2 (npm, C-bindings)',
      async () => {
        await argon2.verify(hash, password)
      },
    ).run({ time: 10000, iterations: 5, warmupIterations: 1 })
  }
})
