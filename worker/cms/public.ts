import { isShopListed, toPublicProduct, type InventoryProduct } from '../../app/database/products'
import { FEATURED_PRODUCT_COUNT, type CmsBlock, type CmsEvent, type CmsPage, type PublicCmsPayload } from '../../app/cms/types'
import { normalizePagePath } from '../hosts'
import {
  getPageByPath,
  getProductBySlugRow,
  getSettings,
  listEvents,
  listFaqs,
  listInventory,
  listMedia,
  listNav,
  listShopProducts,
  type CmsDb
} from './db'
import { ensureSeeded } from './seed'

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

export async function buildPublicPayload(db: CmsDb, pathname: string): Promise<PublicCmsPayload> {
  await ensureSeeded(db)
  const settings = (await getSettings(db))!
  const navItems = await listNav(db)
  const inventory = await listInventory(db)
  const products = await listShopProducts(db)
  const events = await listEvents(db)
  const faqs = await listFaqs(db)
  const mediaCopy = Object.fromEntries(
    (await listMedia(db)).filter((item) => item.title || item.alt).map((item) => [item.url, { title: item.title, alt: item.alt }])
  )
  const path = normalizePagePath(pathname)

  const payload = {
    settings,
    nav: {
      header: navItems.filter((item) => item.location === 'header'),
      footer: navItems.filter((item) => item.location === 'footer')
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

  const productMatch = path.match(/^\/products\/([^/]+)$/)
  if (productMatch?.[1]) {
    const item = await getProductBySlugRow(db, productMatch[1])
    if (!item || !isShopListed(item)) {
      return { ...payload, notFound: true }
    }
    return {
      ...payload,
      product: toPublicProduct(item, item.slug),
      similarProductIds: similarIds(inventory, item.id)
    }
  }

  const page = await getPageByPath(db, path)
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
