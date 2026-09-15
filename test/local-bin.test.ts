import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { localBin } from '../vite/local-bin'

describe('running a project tool from a child process', () => {
  it('points at the installed entry point of each tool the sync runs, under the running Node', () => {
    for (const name of ['vite-node', 'wrangler', 'prettier']) {
      const { command, args } = localBin(name)
      expect(command).toBe(process.execPath)
      expect(args).toHaveLength(1)
      expect(args[0]).toContain(`node_modules/${name}/`)
      expect(fs.existsSync(args[0])).toBe(true)
    }
  })

  it('says what to run when the tool is not installed', () => {
    expect(() => localBin('surely-not-installed-tool')).toThrow('surely-not-installed-tool is not installed — run `npm install`.')
  })
})
