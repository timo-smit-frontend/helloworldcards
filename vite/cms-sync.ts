import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { seedProductWithSlug } from '../app/cms/seed-content'
import { seedProductRecords } from '../app/cms/seed-products'
import type { ProductRecord } from '../app/database/products'
import { upsertProductWithId, type CmsDb, type CmsPreparedStatement } from '../worker/cms/db'
import type { MediaBucket } from '../worker/cms/media'

const DATABASE = 'helloworldcards'

export function sqlLiteral(value: unknown): string {
  if (value == null) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Inline bound parameters, because the Wrangler CLI takes SQL text and nothing else. */
export function inlineParams(query: string, params: unknown[]): string {
  let index = 0
  return query.replace(/\?/g, () => sqlLiteral(params[index++]))
}

type WranglerRow = Record<string, unknown>
type WranglerResult = { results?: WranglerRow[]; success?: boolean }

function runWrangler(args: string[], stdio: 'pipe' | 'inherit' = 'pipe'): string {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio, maxBuffer: 64 * 1024 * 1024 }) ?? ''
}

function queryRemote(sql: string): WranglerRow[] {
  const stdout = runWrangler(['d1', 'execute', DATABASE, '--remote', '--json', '--command', sql])
  const parsed = JSON.parse(stdout) as WranglerResult[]
  const first = parsed[0]
  if (!first?.success) {
    throw new Error(`Remote D1 query failed: ${sql.slice(0, 120)}`)
  }
  return first.results ?? []
}

/**
 * A `CmsDb` backed by `wrangler d1 execute --remote`, so the same pull and push code runs
 * against production as against the local database. Reads go over the wire immediately;
 * writes are queued and shipped in one `--file` batch, since each Wrangler call costs a
 * process spawn and a round trip.
 */
export type RemoteCmsDb = CmsDb & { flush(): Promise<number>; pending(): number }

export function remoteCmsDb(): RemoteCmsDb {
  const queued: string[] = []

  const statement = (query: string, params: unknown[]): CmsPreparedStatement => ({
    bind: (...next: unknown[]) => statement(query, next),
    async first<T>() {
      const rows = queryRemote(inlineParams(query, params))
      return (rows[0] as T | undefined) ?? null
    },
    async all<T>() {
      return { results: queryRemote(inlineParams(query, params)) as T[] }
    },
    async run() {
      queued.push(inlineParams(query, params))
      return { success: true, meta: { last_row_id: 0, changes: 1 } }
    }
  })

  return {
    prepare: (query: string) => statement(query, []),
    pending: () => queued.length,
    async flush() {
      if (queued.length === 0) {
        return 0
      }
      const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-d1-')), 'push.sql')
      await fs.writeFile(file, `${queued.join(';\n')};\n`)
      const count = queued.length
      queued.length = 0
      runWrangler(['d1', 'execute', DATABASE, '--remote', '--yes', '--file', file], 'inherit')
      return count
    }
  }
}

/** Generated files are committed, so they go through Prettier like everything else. */
export function formatGeneratedFile(filePath: string): void {
  try {
    execFileSync('npx', ['prettier', '--write', filePath], { stdio: 'ignore' })
  } catch {
    // Formatting is cosmetic; never fail a sync over it.
  }
}

export type LocalCms = {
  db: CmsDb
  media: MediaBucket
  dispose(): Promise<void>
}

export async function openLocalCms(root: string): Promise<LocalCms> {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({ configPath: path.join(root, 'wrangler.jsonc'), persist: true })
  const env = proxy.env as { DB?: CmsDb; MEDIA?: MediaBucket }
  if (!env.DB || !env.MEDIA) {
    await proxy.dispose()
    throw new Error('The D1 and R2 bindings are not available. Run `npx wrangler login` and try again.')
  }
  return { db: env.DB, media: env.MEDIA, dispose: () => proxy.dispose() }
}

/**
 * Write the seed inventory into a database keeping each product's seed id, so a product
 * added to the seed file is created rather than skipped, and one that already exists is
 * updated in place instead of being duplicated under a fresh id.
 */
export async function pushSeedProducts(db: CmsDb, products: ProductRecord[] = seedProductRecords): Promise<number> {
  for (const product of products) {
    await upsertProductWithId(db, product.id, seedProductWithSlug(product, products))
  }
  return products.length
}
