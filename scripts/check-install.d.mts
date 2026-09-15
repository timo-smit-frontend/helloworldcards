/** Types for the plain-Node script, so the tests can import it. */
export type Lockfile = {
  packages?: Record<string, { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>
}

export function packagesBehindLockfile(lock: Lockfile, installedVersion: (name: string) => string | null): string[]
