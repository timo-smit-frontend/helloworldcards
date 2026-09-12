import { isShopListed, toPublicProduct, type InventoryProduct } from '../../app/database/products'
import {
  FEATURED_PRODUCT_COUNT,
  type CmsBlock,
  type CmsEvent,
  type CmsPage,
  type CmsSettings,
  type PublicCmsPayload
} from '../../app/cms/types'
import type { CmsFaq, CmsNavItem } from '../../app/cms/types'
import { normalizePagePath } from '../hosts'
import {
  batchAll,
  rowToInventory,
  rowToPage,
  rowToSettings,
  SQL,
  type CmsDb,
  type MediaCopyRow,
  type PageRow,
  type ProductRow,
  type SettingsRow
} from './db'
import { ensureSeeded, needsSeeding } from './seed'

function upcomingEvents(events: CmsEvent[], now = new Date()): CmsEvent[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return events.filter((event) => event.date >= today)
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function resolveBlocks(blocks: CmsBlock[], events: CmsEvent[]): CmsBlock[] {
  return blocks.map((block) => {
    if (block.type === 'content_agenda' && !block.eventIds?.length) {
      return { ...block, eventIds: upcomingEvents(events).map((event) => event.id) }
    }
    return block
  })
}

function similarIds(inventory: InventoryProduct[], excludeId: number, count = FEATURED_PRODUCT_COUNT): number[] {
  return shuffle(inventory.filter((item) => item.id !== excludeId && isShopListed(item)))
    .slice(0, count)
    .map((item) => item.id)
}

const PRODUCT_PATH = /^\/products\/([^/]+)$/

type PublicRows = {
  settings: CmsSettings | null
  nav: CmsNavItem[]
  inventory: InventoryProduct[]
  events: CmsEvent[]
  faqs: CmsFaq[]
  mediaCopy: PublicCmsPayload['mediaCopy']
  page: CmsPage | null
  product: InventoryProduct | null
}

/**
 * Everything a page needs, in one round trip. The site used to read these tables one
 * after another — nine trips to the database before a single byte of HTML could go out —
 * and read the product table twice on the way. The page or product row is fetched in
 * the same batch, since the path already says which of the two it is.
 */
async function readPublicRows(db: CmsDb, path: string, slug: string | undefined): Promise<PublicRows> {
  const [settings, nav, inventory, events, faqs, media, target] = await batchAll(db, [
    db.prepare(SQL.settings),
    db.prepare(SQL.nav),
    db.prepare(SQL.inventory),
    db.prepare(SQL.events),
    db.prepare(SQL.faqs),
    db.prepare(SQL.mediaCopy),
    slug ? db.prepare(SQL.productBySlug).bind(slug) : db.prepare(SQL.pageByPath).bind(path)
  ])

  return {
    settings: rowToSettings(settings.results[0] as SettingsRow | undefined),
    nav: nav.results as CmsNavItem[],
    inventory: (inventory.results as ProductRow[]).map(rowToInventory),
    events: events.results as CmsEvent[],
    faqs: faqs.results as CmsFaq[],
    mediaCopy: Object.fromEntries(
      (media.results as MediaCopyRow[]).map((row) => [`/media/${row.key}`, { title: row.title, alt: row.alt }])
    ),
    page: !slug && target.results[0] ? rowToPage(target.results[0] as PageRow) : null,
    product: slug && target.results[0] ? rowToInventory(target.results[0] as ProductRow) : null
  }
}

export async function buildPublicPayload(db: CmsDb, pathname: string): Promise<PublicCmsPayload> {
  const path = normalizePagePath(pathname)
  const slug = path.match(PRODUCT_PATH)?.[1]

  let rows = await readPublicRows(db, path, slug)
  if (needsSeeding(rows.settings)) {
    // A fresh database, or one waiting on a one-shot migration: the only time the read
    // has to be paid twice.
    await ensureSeeded(db, rows.settings)
    rows = await readPublicRows(db, path, slug)
  }

  const { settings, nav, inventory, events, faqs, mediaCopy } = rows
  const products = inventory.filter(isShopListed).map((item) => toPublicProduct(item, item.slug))

  const payload = {
    settings: settings!,
    nav: {
      header: nav.filter((item) => item.location === 'header'),
      footer: nav.filter((item) => item.location === 'footer')
    },
    products,
    events,
    faqs,
    mediaCopy,
    similarProductIds: [] as number[],
    product: null as PublicCmsPayload['product'],
    page: null as CmsPage | null,
    notFound: false
  }

  if (slug) {
    const item = rows.product
    if (!item || !isShopListed(item)) {
      return { ...payload, notFound: true }
    }
    return {
      ...payload,
      product: toPublicProduct(item, item.slug),
      similarProductIds: similarIds(inventory, item.id)
    }
  }

  const page = rows.page
  if (!page || page.status !== 'published') {
    return { ...payload, notFound: true }
  }

  const blocks = resolveBlocks(page.blocks, events)
  const featured = blocks.some((block) => block.type === 'content_products' && block.random)

  return {
    ...payload,
    products: featured ? shuffle(products) : products,
    page: { ...page, blocks }
  }
}
