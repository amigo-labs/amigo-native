import { defineConfig } from 'vitest/config'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [wasm()],
  test: {
    benchmark: {
      include: ['crates/*/__bench__/**/*.bench.ts'],
      reporters: ['default'],
    },
  },
})
