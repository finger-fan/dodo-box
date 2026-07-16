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
      ['tests/integration/nostr-adapter.test.ts', 'node'],
      ['tests/integration/**', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    globalSetup: ['./tests/integration/global-setup.ts'],
    globalTeardown: ['./tests/integration/global-teardown.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['lib/nostr/**/*.ts', 'lib/welshman/relay-manager.ts', 'lib/welshman/crypto.ts', 'lib/runtime-config.ts', 'hooks/nostr/**/*.ts'],
      exclude: ['lib/nostr/mock-telegram-adapter.ts', 'lib/nostr/relay-client.ts'],
      thresholds: {
        global: { lines: 70, functions: 60, branches: 50 },
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
