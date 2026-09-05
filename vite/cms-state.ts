import fs from 'node:fs/promises'
import path from 'node:path'
import prettier from 'prettier'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import type { ProductRecord } from '../app/database/products'
import { formatContentSnapshot, pullContent, pushContent, type CmsContentSnapshot } from '../worker/cms/content-sync'
import { formatMediaSnapshot, pullMediaLibrary, pushMediaLibrary, type CmsMediaSnapshot } from '../worker/cms/media-library-sync'
import { rowToRecord, trashRowsMissingFrom, type CmsDb } from '../worker/cms/db'
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

export async function readProducts(db: CmsDb): Promise<ProductRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC')
    .all<Parameters<typeof rowToRecord>[0]>()
  return results.map(rowToRecord)
}

export async function readCmsState(db: CmsDb): Promise<CmsState> {
  return {
    content: await pullContent(db),
    products: await readProducts(db),
    media: await pullMediaLibrary(db)
  }
}

/** Apply a whole state to a database, deletions included. */
export async function writeCmsState(db: CmsDb, state: CmsState): Promise<void> {
  await pushContent(db, state.content)
  await pushSeedProducts(db, state.products)
  await trashRowsMissingFrom(
    db,
    'products',
    'id',
    state.products.map((product) => product.id)
  )
  await pushMediaLibrary(db, state.media)
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

/** The parts where a database and the committed files disagree. */
export async function seedFileDrift(root: string, state: CmsState): Promise<CmsSeedPart[]> {
  const rendered = await renderCmsState(root, state)
  const current = await readSeedFiles(root)
  return CMS_SEED_PARTS.filter((part) => current[part] !== rendered[part])
}
