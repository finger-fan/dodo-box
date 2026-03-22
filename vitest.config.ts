import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['tests/unit/lib/**', 'node'],
      ['tests/integration/**', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['lib/**/*.ts', 'hooks/**/*.ts', 'contexts/**/*.tsx'],
      thresholds: {
        global: { lines: 80, functions: 80, branches: 75 },
      },
    },
    deps: {
      inline: ['nostr-tools'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
