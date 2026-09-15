import { describe, expect, it } from 'vitest'
import { packagesBehindLockfile } from '../scripts/check-install.mjs'

const lock = {
  packages: {
    '': {
      dependencies: { react: '^19.2.0' },
      devDependencies: { 'vite-node': '^3.2.4', wrangler: '^4.128.0' }
    },
    'node_modules/react': { version: '19.2.0' },
    'node_modules/vite-node': { version: '3.2.4' },
    'node_modules/wrangler': { version: '4.128.0' },
    // Platform packages the lockfile lists for other machines are never asked for.
    'node_modules/@esbuild/win32-x64': { version: '0.28.2', optional: true }
  }
}

describe('checking node_modules against the lockfile before the dev server starts', () => {
  it('is quiet when every direct dependency is installed at the locked version', () => {
    const installed = { react: '19.2.0', 'vite-node': '3.2.4', wrangler: '4.128.0' }
    expect(packagesBehindLockfile(lock, (name: string) => installed[name as keyof typeof installed] ?? null)).toEqual([])
  })

  it('names a dependency that was added to the lockfile but never installed', () => {
    const installed = { react: '19.2.0', wrangler: '4.128.0' }
    expect(packagesBehindLockfile(lock, (name: string) => installed[name as keyof typeof installed] ?? null)).toEqual([
      'vite-node@3.2.4 (not installed)'
    ])
  })

  it('names a dependency the lockfile moved to another version', () => {
    const installed = { react: '19.2.0', 'vite-node': '3.2.4', wrangler: '4.127.0' }
    expect(packagesBehindLockfile(lock, (name: string) => installed[name as keyof typeof installed] ?? null)).toEqual([
      'wrangler@4.128.0 (4.127.0 installed)'
    ])
  })
})
