#!/usr/bin/env node
// Runs before `npm run dev`: node_modules must hold what package-lock.json says.
//
// The dev server keeps the local database in step with production through a child
// process that runs vite-node and Wrangler. When a pull brings in a dependency that is
// never installed, that child cannot start, the sync fails on every attempt, and the
// local database quietly goes stale — which once had a reserved card scanned for a
// price. So a checkout that is behind its lockfile is installed before the server
// starts, and a pull is all it takes.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The project's own dependencies that node_modules lacks or holds at another version
 * than the lockfile names, as `name@wanted (why)`. Only direct dependencies are looked
 * at: deeper ones follow from these, and platform-specific optional packages would
 * otherwise always look missing.
 */
export function packagesBehindLockfile(lock, installedVersion) {
  const root = lock.packages?.[''] ?? {}
  const wanted = { ...(root.dependencies ?? {}), ...(root.devDependencies ?? {}) }
  const behind = []
  for (const name of Object.keys(wanted)) {
    const locked = lock.packages?.[`node_modules/${name}`]?.version ?? wanted[name]
    const installed = installedVersion(name)
    if (installed == null) {
      behind.push(`${name}@${locked} (not installed)`)
    } else if (installed !== locked) {
      behind.push(`${name}@${locked} (${installed} installed)`)
    }
  }
  return behind
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const installedVersion = (name) => {
    try {
      return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version ?? null
    } catch {
      return null
    }
  }
  const behind = packagesBehindLockfile(lock, installedVersion)
  if (behind.length === 0) {
    return
  }
  console.log(`node_modules is behind package-lock.json — ${behind.join(', ')} — running npm install first`)
  // Under an npm script the running npm is known; outside one, `npm` on the PATH — through
  // a shell, so that `npm.cmd` on Windows is found.
  const npm = process.env.npm_execpath
  const result = npm
    ? spawnSync(process.execPath, [npm, 'install'], { cwd: root, stdio: 'inherit' })
    : spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('npm install did not finish; the dev server is not started.')
    process.exit(result.status ?? 1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
