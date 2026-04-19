import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    benchmark: {
      include: ['crates/*/__bench__/**/*.bench.ts'],
      reporters: ['default'],
    },
  },
})
