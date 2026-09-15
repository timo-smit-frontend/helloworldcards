import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

/**
 * How to run one of this project's own CLI tools — Wrangler, Prettier, vite-node — from
 * a child process, on macOS and on Windows alike.
 *
 * `npx <tool>` was the obvious way and is not portable: `npx` is `npx.cmd` on Windows,
 * which a spawn without a shell cannot find (ENOENT), and Node refuses to spawn a
 * `.cmd` through a shell without one being asked for. Running the tool's JavaScript
 * entry point under the very Node that is already running needs neither, and skips
 * npx's registry lookup as well. The entry is read from the package's own `bin` field,
 * so the path follows whatever the installed version ships.
 *
 * The package is looked up by directory, the way npm links `node_modules/.bin`, rather
 * than through `require.resolve('<tool>/package.json')`: a package whose `exports` map
 * leaves `package.json` out would otherwise look uninstalled.
 */
export function localBin(name: string): { command: string; args: string[] } {
  const packageJson = installedPackageJson(name)
  if (!packageJson) {
    throw new Error(`${name} is not installed. Run \`npm install\`.`)
  }
  const { bin } = require(packageJson) as { bin?: string | Record<string, string> }
  const entry = typeof bin === 'string' ? bin : bin?.[name]
  if (!entry) {
    throw new Error(`${name} does not ship a command-line entry point.`)
  }
  return { command: process.execPath, args: [path.join(path.dirname(packageJson), entry)] }
}

function installedPackageJson(name: string): string | null {
  for (const directory of require.resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name, 'package.json')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
