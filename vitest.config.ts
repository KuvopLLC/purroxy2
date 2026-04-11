import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/backend/**', 'node_modules', 'dist', 'dist-electron'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['electron/**/*.ts', 'core/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/index.ts']
    },
    // Use jsdom for frontend tests, node for electron/core tests
    environmentMatchGlobs: [
      ['tests/frontend/**', 'jsdom'],
      ['tests/electron/**', 'node'],
      ['tests/core/**', 'node']
    ],
    setupFiles: ['tests/setup/electron-mocks.ts']
  }
})
