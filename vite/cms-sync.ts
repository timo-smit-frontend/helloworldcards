import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { seedProductWithSlug } from '../app/cms/seed-content'
import { seedProductRecords } from '../app/cms/seed-products'
import type { ProductRecord } from '../app/database/products'
import { upsertProductWithId, type CmsDb, type CmsPreparedStatement } from '../worker/cms/db'
import type { MediaBucket } from '../worker/cms/media'
import { localBin } from './local-bin'

const DATABASE = 'helloworldcards'

function sqlLiteral(value: unknown): string {
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
  const wrangler = localBin('wrangler')
  return execFileSync(wrangler.command, [...wrangler.args, ...args], { encoding: 'utf8', stdio, maxBuffer: 64 * 1024 * 1024 }) ?? ''
}

/** How the remote database reaches production. A test stands in for Wrangler. */
export type RemoteTransport = {
  /** Run reads in one call: one set of rows per statement, in the order given. */
  read(statements: string[]): Promise<WranglerRow[][]>
  /** Run writes as one file, which D1 applies in a single transaction. */
  write(statements: string[]): Promise<void>
}

const wranglerTransport: RemoteTransport = {
  async read(statements) {
    // D1's query endpoint takes several statements at once and answers each in turn, so a
    // whole pull costs one process and one round trip instead of one per table.
    const stdout = runWrangler(['d1', 'execute', DATABASE, '--remote', '--json', '--command', statements.join(';\n')])
    const parsed = JSON.parse(stdout) as WranglerResult[]
    const failed = statements.findIndex((_, index) => !parsed[index]?.success)
    if (failed >= 0) {
      throw new Error(`Remote D1 query failed: ${statements[failed].slice(0, 120)}`)
    }
    return parsed.map((result) => result.results ?? [])
  },
  async write(statements) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-d1-'))
    try {
      const file = path.join(directory, 'push.sql')
      await fs.writeFile(file, `${statements.join(';\n')};\n`)
      runWrangler(['d1', 'execute', DATABASE, '--remote', '--yes', '--file', file], 'inherit')
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
}

const READ = /^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i

/**
 * A `CmsDb` backed by `wrangler d1 execute --remote`, so the same pull and push code runs
 * against production as against the local database. Each Wrangler call costs a process
 * spawn and a round trip, so reads are batched where the caller batches them, and every
 * write — however it is issued — is queued and shipped in one `--file` transaction by
 * `flush`, which a dry run never calls.
 *
 * A queued write is not in production until the flush, so nothing can read it back
 * before then: a batch that writes queues its writes, and its reads come back empty
 * rather than describing a state production is not in yet.
 */
export type RemoteCmsDb = CmsDb & { flush(): Promise<number>; pending(): number }

export function remoteCmsDb(transport: RemoteTransport = wranglerTransport): RemoteCmsDb {
  const queued: string[] = []
  const sqlOf = new WeakMap<CmsPreparedStatement, string>()

  async function batch<T>(
    statements: CmsPreparedStatement[]
  ): Promise<Array<{ results: T[]; meta: { last_row_id: number; changes: number } }>> {
    const sql = statements.map((statement) => {
      const text = sqlOf.get(statement)
      if (text === undefined) {
        throw new Error('A remote batch can only run statements this database prepared.')
      }
      return text
    })
    if (sql.every((text) => READ.test(text))) {
      return (await transport.read(sql)).map((rows) => ({ results: rows as T[], meta: { last_row_id: 0, changes: 0 } }))
    }
    return sql.map((text) => {
      if (READ.test(text)) {
        return { results: [], meta: { last_row_id: 0, changes: 0 } }
      }
      queued.push(text)
      return { results: [], meta: { last_row_id: 0, changes: 1 } }
    })
  }

  const statement = (query: string, params: unknown[]): CmsPreparedStatement => {
    const prepared: CmsPreparedStatement = {
      bind: (...next: unknown[]) => statement(query, next),
      async first<T>() {
        const [{ results }] = await batch<T>([prepared])
        return results[0] ?? null
      },
      async all<T>() {
        const [result] = await batch<T>([prepared])
        return result
      },
      async run() {
        queued.push(inlineParams(query, params))
        return { success: true, meta: { last_row_id: 0, changes: 1 } }
      }
    }
    sqlOf.set(prepared, inlineParams(query, params))
    return prepared
  }

  return {
    prepare: (query: string) => statement(query, []),
    batch,
    pending: () => queued.length,
    async flush() {
      if (queued.length === 0) {
        return 0
      }
      const statements = queued.splice(0)
      await transport.write(statements)
      return statements.length
    }
  }
}

/** Generated files are committed, so they go through Prettier like everything else. */
export function formatGeneratedFile(filePath: string): void {
  try {
    const prettier = localBin('prettier')
    execFileSync(prettier.command, [...prettier.args, '--write', filePath], { stdio: 'ignore' })
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
