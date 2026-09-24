import { sortMediaLibrary } from '../../app/cms/block-previews'
import type {
  CmsBlock,
  CmsEvent,
  CmsFaq,
  CmsMedia,
  CmsMediaFolder,
  CmsNavItem,
  CmsPage,
  CmsPageStatus,
  CmsSettings
} from '../../app/cms/types'
import type { InventoryProduct, ProductRecord } from '../../app/database/products'
import { isShopListed, toInventoryProduct, toPublicProduct } from '../../app/database/products'
import { soldPhotoName } from '../../app/services/sold-photos'

export type CmsStatementResult<T = Record<string, unknown>> = {
  results: T[]
  meta?: { last_row_id: number; changes: number }
}

export type CmsPreparedStatement = {
  bind(...params: unknown[]): CmsPreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<CmsStatementResult<T>>
  run(): Promise<{ success?: boolean; meta: { last_row_id: number; changes: number } }>
}

export type CmsDb = {
  prepare(query: string): CmsPreparedStatement
  /**
   * D1 runs a batch in one round trip and one transaction. It is optional so that a
   * database that only knows `prepare` still works, statement by statement.
   */
  batch?<T = Record<string, unknown>>(statements: CmsPreparedStatement[]): Promise<CmsStatementResult<T>[]>
}

/**
 * Run several statements in one round trip where the database can. Every request to the
 * site used to spend a round trip per table it read; batching turns that into one.
 */
export async function batchAll<T = Record<string, unknown>>(
  db: CmsDb,
  statements: CmsPreparedStatement[]
): Promise<CmsStatementResult<T>[]> {
  if (statements.length === 0) {
    return []
  }
  if (db.batch) {
    return db.batch<T>(statements)
  }
  const results: CmsStatementResult<T>[] = []
  for (const statement of statements) {
    results.push(await statement.all<T>())
  }
  return results
}

/** A read made of several statements, kept apart from its parsing so it can share a batch. */
export type BatchedRead<T> = {
  statements: CmsPreparedStatement[]
  parse(results: CmsStatementResult[]): T
}

type ReadValues<R extends readonly BatchedRead<unknown>[]> = { -readonly [K in keyof R]: R[K] extends BatchedRead<infer T> ? T : never }

/**
 * Run several reads as one batch — one round trip, where a pull used to spend one per
 * table — and hand each its own results back.
 */
export async function batchReads<const R extends readonly BatchedRead<unknown>[]>(db: CmsDb, reads: R): Promise<ReadValues<R>> {
  const results = await batchAll(
    db,
    reads.flatMap((read) => read.statements)
  )
  let offset = 0
  return reads.map((read) => {
    const own = results.slice(offset, offset + read.statements.length)
    offset += read.statements.length
    return read.parse(own)
  }) as ReadValues<R>
}

type TrashTable = 'products' | 'events' | 'faqs' | 'pages'

/**
 * Each of these used to look the row up and then write it, two round trips apiece. The
 * write is now conditional on the row's state, so its own change count says whether it
 * applied; trashing is the one case that has to tell "already trashed" from "no such
 * row", and that lookup travels in the same batch.
 */
export async function trashRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const [, found] = await batchAll<{ id: number }>(db, [
    db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), id),
    db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id)
  ])
  return found.results.length > 0
}

export async function restoreRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const restored = await db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`).bind(id).run()
  return restored.meta.changes > 0
}

export async function permanentlyDeleteRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const deleted = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).bind(id).run()
  return deleted.meta.changes > 0
}

export type ProductRow = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string
  pokemon_id: number | null
  price: string | null
  language: string | null
  grader: string | null
  year: number | null
  marktplaats_url: string | null
  vinted_url: string | null
  slug: string
  cost: number | null
  sold: number
  reserved: number
  concept: number
  sold_at: string | null
  acquired_at: string | null
  grade: number | null
  cardmarket_url: string | null
  reverse_holo: number
  first_edition: number
}

export type PageRow = {
  id: number
  path: string
  status: CmsPageStatus
  title: string
  seo_title: string
  seo_description: string
  seo_image: string | null
  blocks: string
}

function asBool(value: number): boolean {
  return value === 1
}

export function rowToRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    images: JSON.parse(row.images) as string[],
    ...(row.pokemon_id != null ? { pokemonId: row.pokemon_id } : {}),
    ...(row.price != null ? { price: row.price } : {}),
    ...(row.language ? { language: row.language as ProductRecord['language'] } : {}),
    ...(row.grader ? { grader: row.grader as ProductRecord['grader'] } : {}),
    ...(row.year != null ? { year: row.year } : {}),
    ...(row.marktplaats_url ? { marktplaatsUrl: row.marktplaats_url } : {}),
    ...(row.vinted_url ? { vintedUrl: row.vinted_url } : {}),
    ...(row.cost != null ? { cost: row.cost } : {}),
    ...(asBool(row.sold) ? { sold: true } : {}),
    ...(asBool(row.reserved) ? { reserved: true } : {}),
    ...(asBool(row.concept) ? { concept: true } : {}),
    ...(row.sold_at ? { soldAt: row.sold_at } : {}),
    ...(row.acquired_at ? { acquiredAt: row.acquired_at } : {}),
    ...(row.grade != null ? { grade: row.grade } : {}),
    ...(row.cardmarket_url ? { cardmarketUrl: row.cardmarket_url } : {}),
    ...(asBool(row.reverse_holo) ? { reverseHolo: true } : {}),
    ...(asBool(row.first_edition) ? { firstEdition: true } : {})
  }
}

export function rowToInventory(row: ProductRow): InventoryProduct {
  return toInventoryProduct(rowToRecord(row), row.slug)
}

export function rowToPage(row: PageRow): CmsPage {
  return {
    id: row.id,
    path: row.path,
    status: row.status,
    title: row.title,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoImage: row.seo_image,
    blocks: JSON.parse(row.blocks) as CmsBlock[]
  }
}

/**
 * The reads the site and the admin share. They are kept here as text so that a request
 * can batch several of them into one round trip and still parse the rows with the same
 * helpers the one-off readers below use.
 */
export const SQL = {
  settings: 'SELECT json FROM settings WHERE id = 1',
  nav: 'SELECT id, location, label, href, sort FROM nav_items ORDER BY location ASC, sort ASC, id ASC',
  inventory: 'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC',
  // What the public site can list: every card but the sold ones, which are kept forever
  // for the books and would otherwise be read and thrown away on every page view.
  shopInventory: 'SELECT * FROM products WHERE deleted_at IS NULL AND sold != 1 ORDER BY id ASC',
  // Sold cards stay on the books even once trashed.
  ledger: 'SELECT * FROM products WHERE deleted_at IS NULL OR sold = 1 ORDER BY id ASC',
  productBySlug: 'SELECT * FROM products WHERE slug = ? AND deleted_at IS NULL',
  events: 'SELECT id, title, date, location FROM events WHERE deleted_at IS NULL ORDER BY date ASC, id ASC',
  faqs: 'SELECT id, question, answer FROM faqs WHERE deleted_at IS NULL ORDER BY id ASC',
  pages: 'SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY path ASC',
  pageByPath: 'SELECT * FROM pages WHERE path = ? AND deleted_at IS NULL',
  // Only the copy the site needs: media without a title or alt has nothing to contribute.
  mediaCopy: "SELECT key, title, alt FROM media WHERE title != '' OR alt != ''"
} as const

export type SettingsRow = { json: string }
export type MediaCopyRow = { key: string; title: string; alt: string }

export function rowToSettings(row: SettingsRow | null | undefined): CmsSettings | null {
  if (!row) {
    return null
  }
  const parsed = JSON.parse(row.json) as CmsSettings & { siteName?: string }
  delete parsed.siteName
  return parsed
}

export async function getSettings(db: CmsDb): Promise<CmsSettings | null> {
  return rowToSettings(await db.prepare(SQL.settings).first<SettingsRow>())
}

export async function putSettings(db: CmsDb, settings: CmsSettings): Promise<void> {
  await db
    .prepare('INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
    .bind(JSON.stringify(settings))
    .run()
}

export async function listNav(db: CmsDb): Promise<CmsNavItem[]> {
  const { results } = await db.prepare(SQL.nav).all<CmsNavItem>()
  return results
}

/** Settings and navigation together, the way the admin reads them: one round trip. */
export async function getSettingsAndNav(db: CmsDb): Promise<{ settings: CmsSettings | null; nav: CmsNavItem[] }> {
  const [settings, nav] = await batchAll(db, [db.prepare(SQL.settings), db.prepare(SQL.nav)])
  return { settings: rowToSettings(settings.results[0] as SettingsRow | undefined), nav: nav.results as CmsNavItem[] }
}

/**
 * Swap the whole navigation in one batch and hand back the rows as they now stand,
 * ids included. The delete, the inserts and the read-back used to be a round trip each.
 */
export async function replaceNav(db: CmsDb, items: Array<Omit<CmsNavItem, 'id'>>): Promise<CmsNavItem[]> {
  const results = await batchAll<CmsNavItem>(db, [
    db.prepare('DELETE FROM nav_items'),
    ...items.map((item, index) =>
      db
        .prepare('INSERT INTO nav_items (location, label, href, sort) VALUES (?, ?, ?, ?)')
        .bind(item.location, item.label, item.href, item.sort ?? index)
    ),
    db.prepare(SQL.nav)
  ])
  return results[results.length - 1].results
}

export async function listInventory(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db.prepare(SQL.inventory).all<ProductRow>()
  return results.map(rowToInventory)
}

/**
 * Every product row there is, trashed ones included. The admin's product writes need the
 * live rows for slugs and the trashed rows for the slugs they still reserve; one read
 * serves both instead of a query per question.
 */
export async function listAllProductRows(db: CmsDb): Promise<Array<ProductRow & { deleted_at: string | null }>> {
  const { results } = await db.prepare('SELECT * FROM products ORDER BY id ASC').all<ProductRow & { deleted_at: string | null }>()
  return results
}

export async function listAdminInventory(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY (acquired_at IS NULL), acquired_at DESC, id DESC')
    .all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listTrashedProducts(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC')
    .all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listShopProducts(db: CmsDb) {
  const { results } = await db.prepare(SQL.shopInventory).all<ProductRow>()
  return results
    .map(rowToInventory)
    .filter(isShopListed)
    .map((item) => toPublicProduct(item, item.slug))
}

export async function getProductById(db: CmsDb, id: number): Promise<InventoryProduct | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').bind(id).first<ProductRow>()
  return row ? rowToInventory(row) : null
}

function productWriteValues(product: ProductRecord & { slug: string }) {
  return [
    product.title,
    product.subtitle,
    product.description,
    JSON.stringify(product.images ?? []),
    product.pokemonId ?? null,
    product.price != null ? String(product.price) : null,
    product.language ?? null,
    product.grader ?? null,
    product.year ?? null,
    product.marktplaatsUrl ?? null,
    product.vintedUrl ?? null,
    product.slug,
    product.cost ?? null,
    product.sold ? 1 : 0,
    product.reserved ? 1 : 0,
    product.concept ? 1 : 0,
    product.soldAt ?? null,
    product.acquiredAt ?? null,
    product.grade ?? null,
    product.cardmarketUrl ?? null,
    product.reverseHolo ? 1 : 0,
    product.firstEdition ? 1 : 0
  ]
}

const PRODUCT_COLUMNS = `title, subtitle, description, images, pokemon_id, price, language, grader, year, marktplaats_url, vinted_url, slug, cost, sold, reserved, concept, sold_at, acquired_at, grade, cardmarket_url, reverse_holo, first_edition`

export async function insertProduct(db: CmsDb, product: ProductRecord & { slug: string }): Promise<number> {
  const result = await db
    .prepare(`INSERT INTO products (${PRODUCT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(...productWriteValues(product))
    .run()
  return result.meta.last_row_id
}

export async function updateProduct(db: CmsDb, id: number, product: ProductRecord & { slug: string }): Promise<void> {
  await db
    .prepare(
      `UPDATE products SET title = ?, subtitle = ?, description = ?, images = ?, pokemon_id = ?, price = ?, language = ?, grader = ?, year = ?, marktplaats_url = ?, vinted_url = ?, slug = ?, cost = ?, sold = ?, reserved = ?, concept = ?, sold_at = ?, acquired_at = ?, grade = ?, cardmarket_url = ?, reverse_holo = ?, first_edition = ? WHERE id = ?`
    )
    .bind(...productWriteValues(product), id)
    .run()
}

// Seed syncs address products by the id in the seed file, so the write has to keep that
// id. A plain insert would take a fresh autoincrement id and the next sync would miss the
// row again and insert a second copy.
export async function upsertProductWithId(db: CmsDb, id: number, product: ProductRecord & { slug: string }): Promise<void> {
  const assignments = PRODUCT_COLUMNS.split(', ')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ')
  await db
    .prepare(
      `INSERT INTO products (id, ${PRODUCT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ${assignments}, deleted_at = NULL`
    )
    .bind(id, ...productWriteValues(product))
    .run()
}

export async function listEvents(db: CmsDb): Promise<CmsEvent[]> {
  const { results } = await db.prepare(SQL.events).all<CmsEvent>()
  return results
}

export async function listTrashedEvents(db: CmsDb): Promise<CmsEvent[]> {
  const { results } = await db
    .prepare('SELECT id, title, date, location FROM events WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC')
    .all<CmsEvent>()
  return results
}

export async function insertEvent(db: CmsDb, event: Omit<CmsEvent, 'id'>): Promise<number> {
  const result = await db
    .prepare('INSERT INTO events (title, date, location) VALUES (?, ?, ?)')
    .bind(event.title, event.date, event.location)
    .run()
  return result.meta.last_row_id
}

export async function updateEvent(db: CmsDb, id: number, event: Omit<CmsEvent, 'id'>): Promise<void> {
  await db
    .prepare('UPDATE events SET title = ?, date = ?, location = ? WHERE id = ?')
    .bind(event.title, event.date, event.location, id)
    .run()
}

export async function listFaqs(db: CmsDb): Promise<CmsFaq[]> {
  const { results } = await db.prepare(SQL.faqs).all<CmsFaq>()
  return results
}

export async function listTrashedFaqs(db: CmsDb): Promise<CmsFaq[]> {
  const { results } = await db
    .prepare('SELECT id, question, answer FROM faqs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC')
    .all<CmsFaq>()
  return results
}

export async function insertFaq(db: CmsDb, faq: Omit<CmsFaq, 'id'>): Promise<number> {
  const result = await db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)').bind(faq.question, faq.answer).run()
  return result.meta.last_row_id
}

export async function updateFaq(db: CmsDb, id: number, faq: Omit<CmsFaq, 'id'>): Promise<void> {
  await db.prepare('UPDATE faqs SET question = ?, answer = ? WHERE id = ?').bind(faq.question, faq.answer, id).run()
}

export async function upsertFaqWithId(db: CmsDb, id: number, faq: Omit<CmsFaq, 'id'>): Promise<void> {
  await db
    .prepare(
      'INSERT INTO faqs (id, question, answer) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET question = excluded.question, answer = excluded.answer, deleted_at = NULL'
    )
    .bind(id, faq.question, faq.answer)
    .run()
}

export async function upsertEventWithId(db: CmsDb, id: number, event: Omit<CmsEvent, 'id'>): Promise<void> {
  await db
    .prepare(
      'INSERT INTO events (id, title, date, location) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, date = excluded.date, location = excluded.location, deleted_at = NULL'
    )
    .bind(id, event.title, event.date, event.location)
    .run()
}

export async function listPages(db: CmsDb): Promise<CmsPage[]> {
  const { results } = await db.prepare(SQL.pages).all<PageRow>()
  return results.map(rowToPage)
}

export async function listTrashedPages(db: CmsDb): Promise<CmsPage[]> {
  const { results } = await db.prepare('SELECT * FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC').all<PageRow>()
  return results.map(rowToPage)
}

export async function getPageById(db: CmsDb, id: number): Promise<CmsPage | null> {
  const row = await db.prepare('SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL').bind(id).first<PageRow>()
  return row ? rowToPage(row) : null
}

export async function pagePathTaken(db: CmsDb, path: string, exceptId?: number): Promise<boolean> {
  const row = exceptId
    ? await db.prepare('SELECT id FROM pages WHERE path = ? AND id != ?').bind(path, exceptId).first()
    : await db.prepare('SELECT id FROM pages WHERE path = ?').bind(path).first()
  return row != null
}

export async function insertPage(db: CmsDb, page: Omit<CmsPage, 'id'>): Promise<number> {
  const result = await db
    .prepare('INSERT INTO pages (path, status, title, seo_title, seo_description, seo_image, blocks) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(page.path, page.status, page.title, page.seoTitle, page.seoDescription, page.seoImage, JSON.stringify(page.blocks))
    .run()
  return result.meta.last_row_id
}

// Pages have no stable id across environments, so a synced page is addressed by its
// unique path. Restoring `deleted_at` keeps a push authoritative: what the snapshot holds
// is what the target ends up with.
export async function upsertPageByPath(db: CmsDb, page: Omit<CmsPage, 'id'>): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pages (path, status, title, seo_title, seo_description, seo_image, blocks) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET status = excluded.status, title = excluded.title, seo_title = excluded.seo_title,
       seo_description = excluded.seo_description, seo_image = excluded.seo_image, blocks = excluded.blocks, deleted_at = NULL`
    )
    .bind(page.path, page.status, page.title, page.seoTitle, page.seoDescription, page.seoImage, JSON.stringify(page.blocks))
    .run()
}

export async function updatePage(db: CmsDb, id: number, page: Omit<CmsPage, 'id'>): Promise<void> {
  await db
    .prepare('UPDATE pages SET path = ?, status = ?, title = ?, seo_title = ?, seo_description = ?, seo_image = ?, blocks = ? WHERE id = ?')
    .bind(page.path, page.status, page.title, page.seoTitle, page.seoDescription, page.seoImage, JSON.stringify(page.blocks), id)
    .run()
}

type MediaRow = {
  id: number
  key: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  bytes: number
  title: string
  alt: string
  createdAt: string
  folderId: number | null
}

const MEDIA_COLUMNS =
  'id, key, filename, content_type as contentType, width, height, bytes, title, alt, created_at as createdAt, folder_id as folderId'

function toCmsMedia(row: MediaRow): CmsMedia {
  return { ...row, title: row.title ?? '', alt: row.alt ?? '', folderId: row.folderId ?? null, url: `/media/${row.key}` }
}

export const MEDIA_SQL = `SELECT ${MEDIA_COLUMNS} FROM media ORDER BY id DESC`

/** The library as it is listed, from the rows `MEDIA_SQL` reads. */
export function rowsToMediaLibrary(rows: unknown[]): CmsMedia[] {
  return sortMediaLibrary((rows as MediaRow[]).map(toCmsMedia))
}

export async function listMedia(db: CmsDb): Promise<CmsMedia[]> {
  const { results } = await db.prepare(MEDIA_SQL).all<MediaRow>()
  return rowsToMediaLibrary(results)
}

// Folders are listed the way a file browser lists them: by name, regardless of case.
export const MEDIA_FOLDERS_SQL = 'SELECT id, name FROM media_folders ORDER BY name COLLATE NOCASE ASC, id ASC'

export async function listMediaFolders(db: CmsDb): Promise<CmsMediaFolder[]> {
  const { results } = await db.prepare(MEDIA_FOLDERS_SQL).all<CmsMediaFolder>()
  return results
}

/**
 * The media screen's whole read — the library, its folders, and the storage and request
 * counters the usage widget shows — in one round trip instead of four.
 */
export async function mediaLibrarySnapshot(
  db: CmsDb,
  month: string
): Promise<{ media: CmsMedia[]; folders: CmsMediaFolder[]; storageBytes: number; classA: number; classB: number }> {
  const [rows, folders, storage, usage] = await batchAll(db, [
    db.prepare(MEDIA_SQL),
    db.prepare(MEDIA_FOLDERS_SQL),
    db.prepare('SELECT COALESCE(SUM(bytes), 0) as total FROM media'),
    db.prepare('SELECT class_a as classA, class_b as classB FROM r2_usage WHERE month = ?').bind(month)
  ])
  const counters = usage.results[0] as { classA: number; classB: number } | undefined
  return {
    media: rowsToMediaLibrary(rows.results),
    folders: folders.results as CmsMediaFolder[],
    storageBytes: Number((storage.results[0] as { total: number } | undefined)?.total ?? 0),
    classA: Number(counters?.classA ?? 0),
    classB: Number(counters?.classB ?? 0)
  }
}

export async function getMediaFolderById(db: CmsDb, id: number): Promise<CmsMediaFolder | null> {
  return db.prepare('SELECT id, name FROM media_folders WHERE id = ?').bind(id).first<CmsMediaFolder>()
}

/** Two folders that differ only in case would be indistinguishable in the grid, so the check ignores it. */
export async function mediaFolderNameTaken(db: CmsDb, name: string, exceptId?: number): Promise<boolean> {
  const row =
    exceptId != null
      ? await db.prepare('SELECT id FROM media_folders WHERE name = ? COLLATE NOCASE AND id != ?').bind(name, exceptId).first()
      : await db.prepare('SELECT id FROM media_folders WHERE name = ? COLLATE NOCASE').bind(name).first()
  return row != null
}

export async function insertMediaFolder(db: CmsDb, name: string): Promise<number> {
  const result = await db.prepare('INSERT INTO media_folders (name) VALUES (?)').bind(name).run()
  return result.meta.last_row_id
}

export async function renameMediaFolder(db: CmsDb, id: number, name: string): Promise<boolean> {
  const result = await db.prepare('UPDATE media_folders SET name = ? WHERE id = ?').bind(name, id).run()
  return result.meta.changes > 0
}

/**
 * Drop a folder and put whatever it held back at the top of the library, in one batch.
 * The images themselves are never touched: a folder is only a way of grouping them.
 */
export async function deleteMediaFolder(db: CmsDb, id: number): Promise<boolean> {
  const [found] = await batchAll<{ id: number }>(db, [
    db.prepare('SELECT id FROM media_folders WHERE id = ?').bind(id),
    db.prepare('UPDATE media SET folder_id = NULL WHERE folder_id = ?').bind(id),
    db.prepare('DELETE FROM media_folders WHERE id = ?').bind(id)
  ])
  return found.results.length > 0
}

export async function getMediaById(db: CmsDb, id: number): Promise<CmsMedia | null> {
  const row = await db.prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`).bind(id).first<MediaRow>()
  return row ? toCmsMedia(row) : null
}

function insertMediaStatement(db: CmsDb, media: Omit<CmsMedia, 'id' | 'url'>, ignoreExisting = false): CmsPreparedStatement {
  return db
    .prepare(
      `INSERT ${ignoreExisting ? 'OR IGNORE ' : ''}INTO media (key, filename, content_type, width, height, bytes, title, alt, created_at, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      media.key,
      media.filename,
      media.contentType,
      media.width,
      media.height,
      media.bytes,
      media.title ?? '',
      media.alt ?? '',
      media.createdAt,
      media.folderId ?? null
    )
}

export async function insertMedia(db: CmsDb, media: Omit<CmsMedia, 'id' | 'url'>): Promise<number> {
  const result = await insertMediaStatement(db, media).run()
  return result.meta.last_row_id
}

function fillEmptyMediaCopyStatement(db: CmsDb, key: string, title: string, alt: string): CmsPreparedStatement {
  return db.prepare("UPDATE media SET title = ?, alt = ? WHERE key = ? AND title = '' AND alt = ''").bind(title, alt, key)
}

/**
 * Register a set of files in the library — the seed images — writing the rows and their
 * default copy in one batch rather than two round trips per image.
 */
export async function seedMediaRows(db: CmsDb, files: Array<Omit<CmsMedia, 'id' | 'url'>>): Promise<void> {
  const statements = files.flatMap((file) => [
    insertMediaStatement(db, file, true),
    ...(file.title || file.alt ? [fillEmptyMediaCopyStatement(db, file.key, file.title, file.alt)] : [])
  ])
  // Every statement is idempotent, so the batch can be cut into modest pieces.
  for (let index = 0; index < statements.length; index += 40) {
    await batchAll(db, statements.slice(index, index + 40))
  }
}

export type MediaUpdate = Partial<{ title: string; alt: string; folderId: number | null }>

/**
 * Write whichever of the copy and the folder the caller sent and read the row back in
 * the same round trip; a missing row reads back as null. Fields left out stay as they
 * are, so moving an image between folders never blanks its title.
 */
export async function updateMedia(db: CmsDb, id: number, fields: MediaUpdate): Promise<CmsMedia | null> {
  const assignments: string[] = []
  const values: unknown[] = []
  if (fields.title !== undefined) {
    assignments.push('title = ?')
    values.push(fields.title)
  }
  if (fields.alt !== undefined) {
    assignments.push('alt = ?')
    values.push(fields.alt)
  }
  if (fields.folderId !== undefined) {
    assignments.push('folder_id = ?')
    values.push(fields.folderId)
  }
  const results = await batchAll<MediaRow>(db, [
    ...(assignments.length > 0 ? [db.prepare(`UPDATE media SET ${assignments.join(', ')} WHERE id = ?`).bind(...values, id)] : []),
    db.prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`).bind(id)
  ])
  const row = results[results.length - 1].results[0]
  return row ? toCmsMedia(row) : null
}

// Media URLs are served immutable for a year, so a replacement has to live under a new
// key; every stored reference to the old URL is repointed in the same pass.
const MEDIA_REFERENCE_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'pages', column: 'blocks' },
  { table: 'pages', column: 'seo_image' },
  { table: 'products', column: 'images' },
  { table: 'settings', column: 'json' }
]

/**
 * Point a library row at freshly uploaded bytes. The row update and the four reference
 * rewrites go as one batch, and the row the caller gets back is the one it would read.
 */
export async function replaceMediaFile(
  db: CmsDb,
  existing: CmsMedia,
  fields: { key: string; filename: string; contentType: string; bytes: number }
): Promise<CmsMedia> {
  const previousUrl = `/media/${existing.key}`
  const nextUrl = `/media/${fields.key}`
  await batchAll(db, [
    db
      .prepare('UPDATE media SET key = ?, filename = ?, content_type = ?, bytes = ?, width = NULL, height = NULL WHERE id = ?')
      .bind(fields.key, fields.filename, fields.contentType, fields.bytes, existing.id),
    ...MEDIA_REFERENCE_COLUMNS.map(({ table, column }) =>
      db
        .prepare(`UPDATE ${table} SET ${column} = REPLACE(${column}, ?, ?) WHERE ${column} LIKE ?`)
        .bind(previousUrl, nextUrl, `%${previousUrl}%`)
    )
  ])
  return { ...existing, ...fields, width: null, height: null, url: nextUrl }
}

/** Remove a row and hand back what it was, read and delete in one round trip. */
export async function deleteMedia(db: CmsDb, id: number): Promise<CmsMedia | null> {
  const [row] = await batchAll<MediaRow>(db, [
    db.prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`).bind(id),
    db.prepare('DELETE FROM media WHERE id = ?').bind(id)
  ])
  return row.results[0] ? toCmsMedia(row.results[0]) : null
}

/**
 * Write one media row addressed by its key rather than its id, so a library snapshot
 * pulled from one environment can be applied to another whose autoincrement ids differ.
 * The folder is named for the same reason: its id is local to each database, its name
 * is not, and `upsertMediaFolderByName` has already made sure it exists.
 */
export async function upsertMediaByKey(
  db: CmsDb,
  media: Omit<CmsMedia, 'id' | 'url' | 'folderId'> & { folder: string | null }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media (key, filename, content_type, width, height, bytes, title, alt, created_at, folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM media_folders WHERE name = ?))
       ON CONFLICT(key) DO UPDATE SET
         filename = excluded.filename,
         content_type = excluded.content_type,
         width = excluded.width,
         height = excluded.height,
         bytes = excluded.bytes,
         title = excluded.title,
         alt = excluded.alt,
         created_at = excluded.created_at,
         folder_id = excluded.folder_id`
    )
    .bind(
      media.key,
      media.filename,
      media.contentType,
      media.width,
      media.height,
      media.bytes,
      media.title ?? '',
      media.alt ?? '',
      media.createdAt,
      media.folder
    )
    .run()
}

/** Make sure a folder of this name exists; one that is already there is left alone. */
export async function upsertMediaFolderByName(db: CmsDb, name: string): Promise<void> {
  await db.prepare('INSERT INTO media_folders (name) VALUES (?) ON CONFLICT(name) DO NOTHING').bind(name).run()
}

/** The id of the folder with this name, making the folder when there is none yet. */
export async function ensureMediaFolder(db: CmsDb, name: string): Promise<number> {
  await upsertMediaFolderByName(db, name)
  const row = await db.prepare('SELECT id FROM media_folders WHERE name = ?').bind(name).first<{ id: number }>()
  if (!row) {
    throw new Error(`The media folder "${name}" could not be made.`)
  }
  return row.id
}

/** The small photo a sold card keeps, as its library row will describe it. */
export type SoldPhotoRow = {
  key: string
  filename: string
  contentType: string
  bytes: number
  width: number
  height: number
  folderId: number | null
}

/**
 * Point a sold card at the one small photo it keeps. When the front photo is being
 * replaced, its library row takes the new key — keeping its title and alt — or a row is
 * made when the front had none; the rows of the photos being dropped go; and the
 * product's image list is cut to that one URL. One batch, so the product never points at
 * a row that is not there.
 */
export async function keepSoldPhoto(
  db: CmsDb,
  input: {
    productId: number
    /** The key the card keeps. */
    keep: string
    /** The front original whose row becomes the kept photo, or null when that row is already in place. */
    replace: { front: string; photo: SoldPhotoRow } | null
    /** Keys of the other photos, whose rows go. */
    drop: string[]
  }
): Promise<void> {
  const { productId, keep, replace, drop } = input
  const statements: CmsPreparedStatement[] = []
  if (replace) {
    const { front, photo } = replace
    const { results } = await db
      .prepare('SELECT id, key, filename FROM media WHERE key IN (?, ?)')
      .bind(front, photo.key)
      .all<{ id: number; key: string; filename: string }>()
    const kept = results.find((row) => row.key === photo.key)
    const replaced = results.find((row) => row.key === front)
    if (kept) {
      // A run that was cut short after this row was written: bring it up to date and
      // let the old row go rather than trip over the key it already holds.
      statements.push(
        db
          .prepare('UPDATE media SET filename = ?, content_type = ?, bytes = ?, width = ?, height = ?, folder_id = ? WHERE id = ?')
          .bind(photo.filename, photo.contentType, photo.bytes, photo.width, photo.height, photo.folderId, kept.id)
      )
      if (replaced) {
        statements.push(db.prepare('DELETE FROM media WHERE id = ?').bind(replaced.id))
      }
    } else if (replaced) {
      // The row keeps its own filename, marked the way the key is.
      statements.push(
        db
          .prepare('UPDATE media SET key = ?, filename = ?, content_type = ?, bytes = ?, width = ?, height = ?, folder_id = ? WHERE id = ?')
          .bind(
            photo.key,
            soldPhotoName(replaced.filename),
            photo.contentType,
            photo.bytes,
            photo.width,
            photo.height,
            photo.folderId,
            replaced.id
          )
      )
    } else {
      statements.push(
        insertMediaStatement(db, {
          key: photo.key,
          filename: photo.filename,
          contentType: photo.contentType,
          width: photo.width,
          height: photo.height,
          bytes: photo.bytes,
          title: '',
          alt: '',
          createdAt: new Date().toISOString(),
          folderId: photo.folderId
        })
      )
    }
  }
  if (drop.length > 0) {
    statements.push(db.prepare(`DELETE FROM media WHERE key IN (${drop.map(() => '?').join(', ')})`).bind(...drop))
  }
  statements.push(db.prepare('UPDATE products SET images = ? WHERE id = ?').bind(JSON.stringify([`/media/${keep}`]), productId))
  await batchAll(db, statements)
}

/**
 * Drop the folders a library snapshot no longer holds. Whatever they still held goes
 * back to the top of the library rather than pointing at a folder that is gone. Two
 * plain writes rather than a batch: on the Wrangler-backed database a push queues
 * writes and ships them together, and a batch there would run ahead of the queue.
 */
export async function deleteMediaFoldersExcept(db: CmsDb, names: string[]): Promise<void> {
  const placeholders = names.map(() => '?').join(', ')
  const missing = names.length > 0 ? `name NOT IN (${placeholders})` : '1 = 1'
  await db
    .prepare(`UPDATE media SET folder_id = NULL WHERE folder_id IN (SELECT id FROM media_folders WHERE ${missing})`)
    .bind(...names)
    .run()
  await db
    .prepare(`DELETE FROM media_folders WHERE ${missing}`)
    .bind(...names)
    .run()
}

/** Drop the rows a library snapshot no longer holds: a replaced or a deleted image. */
export async function deleteMediaExcept(db: CmsDb, keys: string[]): Promise<void> {
  // An empty list would be a syntax error, and emptying the library is never the intent.
  if (keys.length === 0) {
    return
  }
  const placeholders = keys.map(() => '?').join(', ')
  await db
    .prepare(`DELETE FROM media WHERE key NOT IN (${placeholders})`)
    .bind(...keys)
    .run()
}

/**
 * Move the rows a snapshot no longer carries into the trash, so deleting something in one
 * admin removes it from the other instead of quietly living on. The rows are trashed
 * rather than dropped, which leaves the same undo the admin itself offers. An empty list
 * is treated as a broken read and trashes nothing.
 */
export async function trashRowsMissingFrom(
  db: CmsDb,
  table: TrashTable,
  column: 'id' | 'path',
  keep: Array<string | number>
): Promise<void> {
  if (keep.length === 0) {
    return
  }
  const placeholders = keep.map(() => '?').join(', ')
  await db
    .prepare(`UPDATE ${table} SET deleted_at = ? WHERE deleted_at IS NULL AND ${column} NOT IN (${placeholders})`)
    .bind(new Date().toISOString(), ...keep)
    .run()
}
