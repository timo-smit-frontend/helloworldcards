import { sortMediaLibrary } from '../../app/cms/block-previews'
import type { CmsBlock, CmsEvent, CmsFaq, CmsMedia, CmsNavItem, CmsPage, CmsPageStatus, CmsSettings } from '../../app/cms/types'
import type { InventoryProduct, ProductRecord } from '../../app/database/products'
import { isShopListed, toInventoryProduct, toPublicProduct, uniqueProductSlug } from '../../app/database/products'

export type CmsPreparedStatement = {
  bind(...params: unknown[]): CmsPreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success?: boolean; meta: { last_row_id: number; changes: number } }>
}

export type CmsDb = {
  prepare(query: string): CmsPreparedStatement
}

type TrashTable = 'products' | 'events' | 'faqs' | 'pages'

async function deletedAt(db: CmsDb, table: TrashTable, id: number): Promise<string | null | undefined> {
  const row = await db.prepare(`SELECT deleted_at as deletedAt FROM ${table} WHERE id = ?`).bind(id).first<{ deletedAt: string | null }>()
  if (!row) {
    return undefined
  }
  return row.deletedAt
}

export async function trashRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const current = await deletedAt(db, table, id)
  if (current === undefined) {
    return false
  }
  if (current) {
    return true
  }
  await db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run()
  return true
}

export async function restoreRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const current = await deletedAt(db, table, id)
  if (!current) {
    return false
  }
  await db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).bind(id).run()
  return true
}

export async function permanentlyDeleteRecord(db: CmsDb, table: TrashTable, id: number): Promise<boolean> {
  const current = await deletedAt(db, table, id)
  if (!current) {
    return false
  }
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
  return true
}

type ProductRow = {
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
  concept: number
  sold_at: string | null
  acquired_at: string | null
  grade: number | null
  cardmarket_url: string | null
  reverse_holo: number
  first_edition: number
}

type PageRow = {
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

export async function getSettings(db: CmsDb): Promise<CmsSettings | null> {
  const row = await db.prepare('SELECT json FROM settings WHERE id = 1').first<{ json: string }>()
  if (!row) {
    return null
  }
  const parsed = JSON.parse(row.json) as CmsSettings & { siteName?: string }
  delete parsed.siteName
  return parsed
}

export async function putSettings(db: CmsDb, settings: CmsSettings): Promise<void> {
  await db
    .prepare('INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
    .bind(JSON.stringify(settings))
    .run()
}

export async function listNav(db: CmsDb): Promise<CmsNavItem[]> {
  const { results } = await db
    .prepare('SELECT id, location, label, href, sort FROM nav_items ORDER BY location ASC, sort ASC, id ASC')
    .all<CmsNavItem>()
  return results
}

export async function replaceNav(db: CmsDb, items: Array<Omit<CmsNavItem, 'id'>>): Promise<void> {
  await db.prepare('DELETE FROM nav_items').run()
  for (const [index, item] of items.entries()) {
    await db
      .prepare('INSERT INTO nav_items (location, label, href, sort) VALUES (?, ?, ?, ?)')
      .bind(item.location, item.label, item.href, item.sort ?? index)
      .run()
  }
}

export async function listInventory(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC').all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listAdminInventory(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY (acquired_at IS NULL), acquired_at DESC, id DESC')
    .all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listLedgerInventory(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db.prepare('SELECT * FROM products WHERE deleted_at IS NULL OR sold = 1 ORDER BY id ASC').all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listTrashedProducts(db: CmsDb): Promise<InventoryProduct[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC')
    .all<ProductRow>()
  return results.map(rowToInventory)
}

export async function listShopProducts(db: CmsDb) {
  const inventory = await listInventory(db)
  return inventory.filter(isShopListed).map((item) => toPublicProduct(item, item.slug))
}

export async function getProductBySlugRow(db: CmsDb, slug: string): Promise<InventoryProduct | null> {
  const row = await db.prepare('SELECT * FROM products WHERE slug = ? AND deleted_at IS NULL').bind(slug).first<ProductRow>()
  return row ? rowToInventory(row) : null
}

export async function getProductById(db: CmsDb, id: number): Promise<InventoryProduct | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').bind(id).first<ProductRow>()
  return row ? rowToInventory(row) : null
}

export async function productSlugTaken(db: CmsDb, slug: string, exceptId?: number): Promise<boolean> {
  const row = exceptId
    ? await db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').bind(slug, exceptId).first()
    : await db.prepare('SELECT id FROM products WHERE slug = ?').bind(slug).first()
  return row != null
}

export function productWriteValues(product: ProductRecord & { slug: string }) {
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
    product.concept ? 1 : 0,
    product.soldAt ?? null,
    product.acquiredAt ?? null,
    product.grade ?? null,
    product.cardmarketUrl ?? null,
    product.reverseHolo ? 1 : 0,
    product.firstEdition ? 1 : 0
  ]
}

const PRODUCT_COLUMNS = `title, subtitle, description, images, pokemon_id, price, language, grader, year, marktplaats_url, vinted_url, slug, cost, sold, concept, sold_at, acquired_at, grade, cardmarket_url, reverse_holo, first_edition`

export async function insertProduct(db: CmsDb, product: ProductRecord & { slug: string }): Promise<number> {
  const result = await db
    .prepare(`INSERT INTO products (${PRODUCT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(...productWriteValues(product))
    .run()
  return result.meta.last_row_id
}

export async function updateProduct(db: CmsDb, id: number, product: ProductRecord & { slug: string }): Promise<void> {
  await db
    .prepare(
      `UPDATE products SET title = ?, subtitle = ?, description = ?, images = ?, pokemon_id = ?, price = ?, language = ?, grader = ?, year = ?, marktplaats_url = ?, vinted_url = ?, slug = ?, cost = ?, sold = ?, concept = ?, sold_at = ?, acquired_at = ?, grade = ?, cardmarket_url = ?, reverse_holo = ?, first_edition = ? WHERE id = ?`
    )
    .bind(...productWriteValues(product), id)
    .run()
}

export async function nextProductSlug(db: CmsDb, product: ProductRecord): Promise<string> {
  const { results } = await db.prepare('SELECT id, title, subtitle FROM products').all<ProductRecord>()
  return uniqueProductSlug(product, results)
}

export async function listEvents(db: CmsDb): Promise<CmsEvent[]> {
  const { results } = await db
    .prepare('SELECT id, title, date, location FROM events WHERE deleted_at IS NULL ORDER BY date ASC, id ASC')
    .all<CmsEvent>()
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
  const { results } = await db.prepare('SELECT id, question, answer FROM faqs WHERE deleted_at IS NULL ORDER BY id ASC').all<CmsFaq>()
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

export async function listPages(db: CmsDb): Promise<CmsPage[]> {
  const { results } = await db.prepare('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY path ASC').all<PageRow>()
  return results.map(rowToPage)
}

export async function listTrashedPages(db: CmsDb): Promise<CmsPage[]> {
  const { results } = await db.prepare('SELECT * FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC').all<PageRow>()
  return results.map(rowToPage)
}

export async function getPageByPath(db: CmsDb, path: string): Promise<CmsPage | null> {
  const row = await db.prepare('SELECT * FROM pages WHERE path = ? AND deleted_at IS NULL').bind(path).first<PageRow>()
  return row ? rowToPage(row) : null
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
}

const MEDIA_COLUMNS = 'id, key, filename, content_type as contentType, width, height, bytes, title, alt, created_at as createdAt'

function toCmsMedia(row: MediaRow): CmsMedia {
  return { ...row, title: row.title ?? '', alt: row.alt ?? '', url: `/media/${row.key}` }
}

export async function listMedia(db: CmsDb): Promise<CmsMedia[]> {
  const { results } = await db.prepare(`SELECT ${MEDIA_COLUMNS} FROM media ORDER BY id DESC`).all<MediaRow>()
  return sortMediaLibrary(results.map(toCmsMedia))
}

export async function getMediaById(db: CmsDb, id: number): Promise<CmsMedia | null> {
  const row = await db.prepare(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`).bind(id).first<MediaRow>()
  return row ? toCmsMedia(row) : null
}

export async function insertMedia(db: CmsDb, media: Omit<CmsMedia, 'id' | 'url'>): Promise<number> {
  const result = await db
    .prepare(
      'INSERT INTO media (key, filename, content_type, width, height, bytes, title, alt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      media.createdAt
    )
    .run()
  return result.meta.last_row_id
}

export async function insertMediaIfAbsent(db: CmsDb, media: Omit<CmsMedia, 'id' | 'url'>): Promise<void> {
  const existing = await db.prepare('SELECT id FROM media WHERE key = ?').bind(media.key).first()
  if (existing) {
    return
  }
  await insertMedia(db, media)
}

export async function fillEmptyMediaCopy(db: CmsDb, key: string, title: string, alt: string): Promise<void> {
  if (!title && !alt) {
    return
  }
  await db.prepare("UPDATE media SET title = ?, alt = ? WHERE key = ? AND title = '' AND alt = ''").bind(title, alt, key).run()
}

export async function updateMedia(db: CmsDb, id: number, fields: { title: string; alt: string }): Promise<CmsMedia | null> {
  const existing = await getMediaById(db, id)
  if (!existing) {
    return null
  }
  await db.prepare('UPDATE media SET title = ?, alt = ? WHERE id = ?').bind(fields.title, fields.alt, id).run()
  return { ...existing, title: fields.title, alt: fields.alt }
}

export async function deleteMedia(db: CmsDb, id: number): Promise<CmsMedia | null> {
  const existing = await getMediaById(db, id)
  if (!existing) {
    return null
  }
  await db.prepare('DELETE FROM media WHERE id = ?').bind(id).run()
  return existing
}
