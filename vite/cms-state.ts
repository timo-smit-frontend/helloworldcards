import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import prettier from 'prettier'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import type { ProductRecord } from '../app/database/products'
import { contentRead, formatContentSnapshot, parseContentSnapshot, pushContent, type CmsContentSnapshot } from '../worker/cms/content-sync'
import {
  formatMediaSnapshot,
  mediaLibraryRead,
  parseMediaSnapshot,
  pushMediaLibrary,
  type CmsMediaSnapshot
} from '../worker/cms/media-library-sync'
import { batchReads, rowToRecord, SQL, trashRowsMissingFrom, type BatchedRead, type CmsDb, type ProductRow } from '../worker/cms/db'
import { pushSeedProducts } from './cms-sync'

/** Everything one CMS database holds that is meant to travel between environments. */
export type CmsState = {
  content: CmsContentSnapshot
  products: ProductRecord[]
  media: CmsMediaSnapshot
}

/** The committed files that record that state, keyed by the part of the CMS they hold. */
export const CMS_SEED_FILES = {
  content: 'seed/cms-content.json',
  products: 'app/cms/seed-products.ts',
  media: 'seed/cms-media.json'
} as const

export type CmsSeedPart = keyof typeof CMS_SEED_FILES

export type CmsSeedFiles = Record<CmsSeedPart, string>

export const CMS_SEED_PARTS = Object.keys(CMS_SEED_FILES) as CmsSeedPart[]

export function seedFilePath(root: string, part: CmsSeedPart): string {
  return path.join(root, CMS_SEED_FILES[part])
}

function productsRead(db: CmsDb): BatchedRead<ProductRecord[]> {
  return {
    statements: [db.prepare(SQL.inventory)],
    parse: ([rows]) => (rows.results as ProductRow[]).map(rowToRecord)
  }
}

/**
 * The whole state in one batch. Against production every round trip is a Wrangler
 * process, and a pull used to start one per table — eight in a row on every settle.
 */
export async function readCmsState(db: CmsDb): Promise<CmsState> {
  const [content, products, media] = await batchReads(db, [contentRead(db), productsRead(db), mediaLibraryRead(db)])
  return { content, products, media }
}

/** Apply a state to a database, deletions included — the whole of it, or only some parts. */
export async function writeCmsState(db: CmsDb, state: CmsState, parts: CmsSeedPart[] = CMS_SEED_PARTS): Promise<void> {
  if (parts.includes('content')) {
    await pushContent(db, state.content)
  }
  if (parts.includes('products')) {
    await pushSeedProducts(db, state.products)
    await trashRowsMissingFrom(
      db,
      'products',
      'id',
      state.products.map((product) => product.id)
    )
  }
  if (parts.includes('media')) {
    await pushMediaLibrary(db, state.media)
  }
}

/**
 * Read `app/cms/seed-products.ts` back without importing it, so an edit made to the file
 * while the dev server is up is seen as it is now rather than as it was at startup. The
 * file is generated as one array literal of strings, numbers, booleans and arrays, which
 * is what the evaluation is restricted to: there is no scope to reach and no time to run.
 */
export function parseSeedProductsSource(source: string): ProductRecord[] {
  const start = source.indexOf('seedProductRecords')
  const equals = start >= 0 ? source.indexOf('=', start) : -1
  if (equals < 0) {
    throw new Error('app/cms/seed-products.ts does not declare seedProductRecords.')
  }
  const literal = source.slice(equals + 1).trim()
  if (!literal.startsWith('[') || !literal.endsWith(']')) {
    throw new Error('app/cms/seed-products.ts does not hold an array of products.')
  }
  const parsed: unknown = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 })
  if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item === 'object' && typeof item.id === 'number')) {
    throw new Error('app/cms/seed-products.ts does not hold an array of products.')
  }
  return parsed as ProductRecord[]
}

/** The parts of a state the committed files describe, for applying an edit made to them. */
export function parseSeedFiles(files: Partial<CmsSeedFiles>, parts: CmsSeedPart[]): Partial<CmsState> {
  const state: Partial<CmsState> = {}
  for (const part of parts) {
    const source = files[part]
    if (source === undefined) {
      throw new Error(`${CMS_SEED_FILES[part]} does not exist.`)
    }
    if (part === 'content') {
      state.content = parseContentSnapshot(source)
    } else if (part === 'products') {
      state.products = parseSeedProductsSource(source)
    } else {
      state.media = parseMediaSnapshot(source)
    }
  }
  return state
}

/** A short digest of one rendered file, so states can be compared and recorded cheaply. */
export function fingerprint(rendered: string): string {
  return createHash('sha256').update(rendered).digest('hex').slice(0, 32)
}

export type CmsFingerprints = Partial<Record<CmsSeedPart, string>>

export function fingerprintSeedFiles(rendered: Partial<CmsSeedFiles>): CmsFingerprints {
  const result: CmsFingerprints = {}
  for (const part of CMS_SEED_PARTS) {
    const source = rendered[part]
    if (source !== undefined) {
      result[part] = fingerprint(source)
    }
  }
  return result
}

/**
 * What this database last settled on with production, kept in the database itself so it
 * can never be separated from it: a wiped or copied database carries no record, and one
 * without a record is never trusted to be ahead of production. The committed files
 * cannot serve as this record — git moves them, and a push can fail after they were
 * written — which is how a local edit once ended up adopted away by production's
 * unchanged state.
 */
export async function readSyncedFingerprints(db: CmsDb): Promise<CmsFingerprints> {
  const { results } = await db.prepare('SELECT part, fingerprint FROM cms_sync_state').all<{ part: string; fingerprint: string }>()
  const synced: CmsFingerprints = {}
  for (const row of results) {
    if ((CMS_SEED_PARTS as string[]).includes(row.part)) {
      synced[row.part as CmsSeedPart] = row.fingerprint
    }
  }
  return synced
}

export async function writeSyncedFingerprints(db: CmsDb, synced: CmsFingerprints): Promise<void> {
  const now = new Date().toISOString()
  for (const part of CMS_SEED_PARTS) {
    const value = synced[part]
    if (value !== undefined) {
      await db
        .prepare(
          'INSERT INTO cms_sync_state (part, fingerprint, synced_at) VALUES (?, ?, ?) ON CONFLICT(part) DO UPDATE SET fingerprint = excluded.fingerprint, synced_at = excluded.synced_at'
        )
        .bind(part, value, now)
        .run()
    }
  }
}

/** Generated files are committed, so they go through Prettier like everything else. */
async function format(source: string, filePath: string): Promise<string> {
  return prettier.format(source, { ...(await prettier.resolveConfig(filePath)), filepath: filePath })
}

/** The state exactly as it would sit on disk, so it can be compared without writing. */
export async function renderCmsState(root: string, state: CmsState): Promise<CmsSeedFiles> {
  return {
    content: await format(formatContentSnapshot(state.content), seedFilePath(root, 'content')),
    products: await format(formatSeedProductsSource(state.products), seedFilePath(root, 'products')),
    media: await format(formatMediaSnapshot(state.media), seedFilePath(root, 'media'))
  }
}

export async function readSeedFiles(root: string): Promise<Partial<CmsSeedFiles>> {
  const entries = await Promise.all(
    CMS_SEED_PARTS.map(async (part) => [part, await fs.readFile(seedFilePath(root, part), 'utf8').catch(() => undefined)] as const)
  )
  return Object.fromEntries(entries.filter(([, source]) => source !== undefined)) as Partial<CmsSeedFiles>
}

/** Write only the files that would actually change, and report which those were. */
export async function writeSeedFiles(root: string, rendered: CmsSeedFiles, parts: CmsSeedPart[] = CMS_SEED_PARTS): Promise<CmsSeedPart[]> {
  const current = await readSeedFiles(root)
  const changed = parts.filter((part) => current[part] !== rendered[part])
  for (const part of changed) {
    await fs.writeFile(seedFilePath(root, part), rendered[part])
  }
  return changed
}

/**
 * Put files back after a write that should not have counted. A part that had no file
 * before is removed again rather than left holding state that was never synced.
 */
export async function restoreSeedFiles(root: string, previous: Partial<CmsSeedFiles>, parts: CmsSeedPart[]): Promise<void> {
  for (const part of parts) {
    const source = previous[part]
    if (source === undefined) {
      await fs.rm(seedFilePath(root, part), { force: true })
    } else {
      await fs.writeFile(seedFilePath(root, part), source)
    }
  }
}
