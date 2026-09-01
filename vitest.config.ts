import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    execArgv: ['--experimental-sqlite']
  }
})
