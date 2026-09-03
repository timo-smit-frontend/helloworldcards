import type { CmsBlock, CmsEvent, CmsFaq, CmsPageStatus, CmsSettings } from '../../app/cms/types'
import { CMS_BLOCK_TYPES } from '../../app/cms/types'
import type { ProductRecord } from '../../app/database/products'
import { CARD_GRADERS, CARD_LANGUAGES, uniqueProductSlug } from '../../app/database/products'
import { parseListedPrice } from '../../app/services/price'
import { isAdminApiAllowed, isReservedPath, normalizePagePath } from '../hosts'
import { handleDashboardRequest, requireAdminSession, type DashboardEnv, type DashboardRuntime } from '../dashboard-api'
import {
  getPageById,
  getProductById,
  getSettings,
  insertEvent,
  insertFaq,
  insertPage,
  insertProduct,
  listEvents,
  listFaqs,
  listInventory,
  listAdminInventory,
  listNav,
  listPages,
  listTrashedEvents,
  listTrashedFaqs,
  listTrashedPages,
  listTrashedProducts,
  nextProductSlug,
  pagePathTaken,
  permanentlyDeleteRecord,
  productSlugTaken,
  putSettings,
  replaceNav,
  restoreRecord,
  trashRecord,
  updateEvent,
  updateFaq,
  updatePage,
  updateProduct,
  type CmsDb
} from './db'
import { json, newBlockId, normalizeApiPath, readJson } from './http'
import { handleMediaRequest } from './media'
import { ensureSeeded } from './seed'

function dbOf(env: DashboardEnv, runtime?: DashboardRuntime): CmsDb | null {
  return runtime?.db ?? env.DB ?? null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function parseProduct(body: Record<string, unknown>, id: number): ProductRecord {
  const language = asString(body.language)
  const grader = asString(body.grader)
  const cost = typeof body.cost === 'number' || typeof body.cost === 'string' ? parseListedPrice(body.cost) : undefined
  return {
    id,
    title: asString(body.title)?.trim() || 'Untitled',
    subtitle: asString(body.subtitle)?.trim() || '',
    description: asString(body.description)?.trim() || '',
    images: Array.isArray(body.images) ? body.images.filter((item): item is string => typeof item === 'string') : [],
    ...(asNumber(body.pokemonId) != null ? { pokemonId: asNumber(body.pokemonId) } : {}),
    ...(body.price != null && body.price !== '' ? { price: String(body.price) } : {}),
    ...(language && (CARD_LANGUAGES as readonly string[]).includes(language) ? { language: language as ProductRecord['language'] } : {}),
    ...(grader && (CARD_GRADERS as readonly string[]).includes(grader) ? { grader: grader as ProductRecord['grader'] } : {}),
    ...(asNumber(body.year) != null ? { year: asNumber(body.year) } : {}),
    ...(asString(body.marktplaatsUrl) ? { marktplaatsUrl: asString(body.marktplaatsUrl) } : {}),
    ...(asString(body.vintedUrl) ? { vintedUrl: asString(body.vintedUrl) } : {}),
    ...(cost != null ? { cost } : {}),
    ...(asBool(body.sold) ? { sold: true } : {}),
    ...(asBool(body.concept) ? { concept: true } : {}),
    ...(asString(body.soldAt) ? { soldAt: asString(body.soldAt) } : {}),
    ...(asString(body.acquiredAt) ? { acquiredAt: asString(body.acquiredAt) } : {}),
    ...(asNumber(body.grade) != null ? { grade: asNumber(body.grade) } : {}),
    ...(asString(body.cardmarketUrl) ? { cardmarketUrl: asString(body.cardmarketUrl) } : {}),
    ...(asBool(body.reverseHolo) ? { reverseHolo: true } : {}),
    ...(asBool(body.firstEdition) ? { firstEdition: true } : {})
  }
}

function parseBlocks(value: unknown): CmsBlock[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is CmsBlock => {
      if (!item || typeof item !== 'object') {
        return false
      }
      const type = (item as { type?: unknown }).type
      return typeof type === 'string' && (CMS_BLOCK_TYPES as readonly string[]).includes(type)
    })
    .map((item) => {
      const id = item.id || newBlockId()
      if (item.type !== 'content_products') {
        return { ...item, id }
      }
      const { random, ...rest } = item as CmsBlock & {
        type: 'content_products'
        random?: unknown
      }
      Reflect.deleteProperty(rest, 'productIds')
      return {
        ...rest,
        id,
        type: 'content_products' as const,
        ...(random ? { random: true } : {})
      }
    })
}

function parsePage(body: Record<string, unknown>): Omit<import('../../app/cms/types').CmsPage, 'id'> | { error: string } {
  const path = normalizePagePath(asString(body.path) || '/')
  if (isReservedPath(path)) {
    return { error: 'That path is reserved.' }
  }

  const status = asString(body.status) === 'draft' ? 'draft' : 'published'
  return {
    path,
    status: status as CmsPageStatus,
    title: asString(body.title)?.trim() || 'Untitled page',
    seoTitle: asString(body.seoTitle)?.trim() || asString(body.title)?.trim() || 'Untitled page',
    seoDescription: asString(body.seoDescription)?.trim() || '',
    seoImage: asString(body.seoImage) || null,
    blocks: parseBlocks(body.blocks)
  }
}

function parseSettings(body: Record<string, unknown>, current: CmsSettings): CmsSettings {
  return {
    siteDescription: asString(body.siteDescription)?.trim() || current.siteDescription,
    siteImage: asString(body.siteImage)?.trim() || current.siteImage,
    siteImageAlt: asString(body.siteImageAlt)?.trim() || current.siteImageAlt,
    contactEmail: asString(body.contactEmail)?.trim() || current.contactEmail,
    instagramUrl: asString(body.instagramUrl)?.trim() || current.instagramUrl,
    marktplaatsUrl: asString(body.marktplaatsUrl)?.trim() || current.marktplaatsUrl,
    notFoundTitle: asString(body.notFoundTitle)?.trim() || current.notFoundTitle,
    notFoundDescription: asString(body.notFoundDescription)?.trim() || current.notFoundDescription,
    notFoundCta: asString(body.notFoundCta)?.trim() || current.notFoundCta
  }
}

async function withDb(env: DashboardEnv, runtime: DashboardRuntime | undefined, work: (db: CmsDb) => Promise<Response>): Promise<Response> {
  const db = dbOf(env, runtime)
  if (!db) {
    return json({ error: 'Database is not available.' }, 503)
  }
  await ensureSeeded(db)
  return work(db)
}

export async function handleAdminRequest(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const url = new URL(request.url)
  if (!isAdminApiAllowed(url.hostname) && url.pathname.startsWith('/api/admin')) {
    return json({ error: 'Not found' }, 404)
  }

  const dashboard = await handleDashboardRequest(request, env, runtime)
  if (dashboard) {
    return dashboard
  }

  const path = normalizeApiPath(url.pathname)
  if (!path.startsWith('/api/admin')) {
    return null
  }

  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const media = await handleMediaRequest(request, env, runtime)
  if (media) {
    return media
  }

  return withDb(env, runtime, async (db) => {
    if (path === '/api/admin/settings' && request.method === 'GET') {
      return json({ settings: await getSettings(db), nav: await listNav(db) })
    }

    if (path === '/api/admin/settings' && request.method === 'PUT') {
      const body = await readJson<Record<string, unknown>>(request)
      if (!body) {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const current = (await getSettings(db))!
      const settings = parseSettings(body, current)
      await putSettings(db, settings)
      if (Array.isArray(body.nav)) {
        const nav = (body.nav as Array<Record<string, unknown>>).map((item, index) => ({
          location: item.location === 'footer' ? ('footer' as const) : ('header' as const),
          label: asString(item.label)?.trim() || 'Link',
          href: asString(item.href)?.trim() || '/',
          sort: asNumber(item.sort) ?? index
        }))
        await replaceNav(db, nav)
      }
      return json({ settings, nav: await listNav(db) })
    }

    if (path === '/api/admin/products' && request.method === 'GET') {
      return json({ products: await listAdminInventory(db) })
    }

    if (path === '/api/admin/products' && request.method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request)
      if (!body) {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const record = parseProduct(body, 0)
      const slug = asString(body.slug)?.trim() || (await nextProductSlug(db, record))
      if (await productSlugTaken(db, slug)) {
        return json({ error: 'That slug is already used.' }, 400)
      }
      const id = await insertProduct(db, { ...record, slug })
      return json({ product: await getProductById(db, id) }, 201)
    }

    if (path === '/api/admin/products/trash' && request.method === 'GET') {
      return json({ products: await listTrashedProducts(db) })
    }

    const productRestore = path.match(/^\/api\/admin\/products\/(\d+)\/restore$/)
    if (productRestore && request.method === 'POST') {
      return (await restoreRecord(db, 'products', Number(productRestore[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const productPermanent = path.match(/^\/api\/admin\/products\/(\d+)\/permanent$/)
    if (productPermanent && request.method === 'DELETE') {
      return (await permanentlyDeleteRecord(db, 'products', Number(productPermanent[1])))
        ? json({ ok: true })
        : json({ error: 'Not found' }, 404)
    }

    const productMatch = path.match(/^\/api\/admin\/products\/(\d+)$/)
    if (productMatch) {
      const id = Number(productMatch[1])
      if (request.method === 'GET') {
        const product = await getProductById(db, id)
        return product ? json({ product }) : json({ error: 'Not found' }, 404)
      }
      if (request.method === 'PUT') {
        const body = await readJson<Record<string, unknown>>(request)
        if (!body) {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const existing = await getProductById(db, id)
        if (!existing) {
          return json({ error: 'Not found' }, 404)
        }
        const record = parseProduct(body, id)
        const others = (await listInventory(db)).filter((item) => item.id !== id)
        const slug = asString(body.slug)?.trim() || uniqueProductSlug(record, others)
        if (await productSlugTaken(db, slug, id)) {
          return json({ error: 'That slug is already used.' }, 400)
        }
        const merged: ProductRecord & { slug: string } = { ...existing, ...record, slug }
        if ('pokemonId' in body) {
          const pokemonId = asNumber(body.pokemonId)
          if (pokemonId != null) {
            merged.pokemonId = pokemonId
          } else {
            delete merged.pokemonId
          }
        }
        await updateProduct(db, id, merged)
        return json({ product: await getProductById(db, id) })
      }
      if (request.method === 'DELETE') {
        return (await trashRecord(db, 'products', id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
      }
    }

    if (path === '/api/admin/events' && request.method === 'GET') {
      return json({ events: await listEvents(db) })
    }

    if (path === '/api/admin/events' && request.method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request)
      if (!body) {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const event = {
        title: asString(body.title)?.trim() || 'Untitled event',
        date: asString(body.date)?.trim() || '',
        location: asString(body.location)?.trim() || ''
      }
      const id = await insertEvent(db, event)
      return json({ event: { id, ...event } }, 201)
    }

    if (path === '/api/admin/events/trash' && request.method === 'GET') {
      return json({ events: await listTrashedEvents(db) })
    }

    const eventRestore = path.match(/^\/api\/admin\/events\/(\d+)\/restore$/)
    if (eventRestore && request.method === 'POST') {
      return (await restoreRecord(db, 'events', Number(eventRestore[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const eventPermanent = path.match(/^\/api\/admin\/events\/(\d+)\/permanent$/)
    if (eventPermanent && request.method === 'DELETE') {
      return (await permanentlyDeleteRecord(db, 'events', Number(eventPermanent[1])))
        ? json({ ok: true })
        : json({ error: 'Not found' }, 404)
    }

    const eventMatch = path.match(/^\/api\/admin\/events\/(\d+)$/)
    if (eventMatch) {
      const id = Number(eventMatch[1])
      const body = request.method === 'PUT' ? await readJson<Record<string, unknown>>(request) : null
      if (request.method === 'PUT') {
        if (!body) {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const event: Omit<CmsEvent, 'id'> = {
          title: asString(body.title)?.trim() || 'Untitled event',
          date: asString(body.date)?.trim() || '',
          location: asString(body.location)?.trim() || ''
        }
        await updateEvent(db, id, event)
        return json({ event: { id, ...event } })
      }
      if (request.method === 'DELETE') {
        return (await trashRecord(db, 'events', id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
      }
    }

    if (path === '/api/admin/faqs' && request.method === 'GET') {
      return json({ faqs: await listFaqs(db) })
    }

    if (path === '/api/admin/faqs' && request.method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request)
      if (!body) {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const faq = {
        question: asString(body.question)?.trim() || 'Question',
        answer: asString(body.answer)?.trim() || ''
      }
      const id = await insertFaq(db, faq)
      return json({ faq: { id, ...faq } }, 201)
    }

    if (path === '/api/admin/faqs/trash' && request.method === 'GET') {
      return json({ faqs: await listTrashedFaqs(db) })
    }

    const faqRestore = path.match(/^\/api\/admin\/faqs\/(\d+)\/restore$/)
    if (faqRestore && request.method === 'POST') {
      return (await restoreRecord(db, 'faqs', Number(faqRestore[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const faqPermanent = path.match(/^\/api\/admin\/faqs\/(\d+)\/permanent$/)
    if (faqPermanent && request.method === 'DELETE') {
      return (await permanentlyDeleteRecord(db, 'faqs', Number(faqPermanent[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const faqMatch = path.match(/^\/api\/admin\/faqs\/(\d+)$/)
    if (faqMatch) {
      const id = Number(faqMatch[1])
      if (request.method === 'PUT') {
        const body = await readJson<Record<string, unknown>>(request)
        if (!body) {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const faq: Omit<CmsFaq, 'id'> = {
          question: asString(body.question)?.trim() || 'Question',
          answer: asString(body.answer)?.trim() || ''
        }
        await updateFaq(db, id, faq)
        return json({ faq: { id, ...faq } })
      }
      if (request.method === 'DELETE') {
        return (await trashRecord(db, 'faqs', id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
      }
    }

    if (path === '/api/admin/pages' && request.method === 'GET') {
      return json({ pages: await listPages(db) })
    }

    if (path === '/api/admin/pages' && request.method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request)
      if (!body) {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const page = parsePage(body)
      if ('error' in page) {
        return json({ error: page.error }, 400)
      }
      if (await pagePathTaken(db, page.path)) {
        return json({ error: 'That path is already used.' }, 400)
      }
      const id = await insertPage(db, page)
      return json({ page: await getPageById(db, id) }, 201)
    }

    if (path === '/api/admin/pages/trash' && request.method === 'GET') {
      return json({ pages: await listTrashedPages(db) })
    }

    const pageRestore = path.match(/^\/api\/admin\/pages\/(\d+)\/restore$/)
    if (pageRestore && request.method === 'POST') {
      return (await restoreRecord(db, 'pages', Number(pageRestore[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const pagePermanent = path.match(/^\/api\/admin\/pages\/(\d+)\/permanent$/)
    if (pagePermanent && request.method === 'DELETE') {
      return (await permanentlyDeleteRecord(db, 'pages', Number(pagePermanent[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }

    const pageMatch = path.match(/^\/api\/admin\/pages\/(\d+)$/)
    if (pageMatch) {
      const id = Number(pageMatch[1])
      if (request.method === 'GET') {
        const page = await getPageById(db, id)
        return page ? json({ page }) : json({ error: 'Not found' }, 404)
      }
      if (request.method === 'PUT') {
        const body = await readJson<Record<string, unknown>>(request)
        if (!body) {
          return json({ error: 'Invalid JSON' }, 400)
        }
        const page = parsePage(body)
        if ('error' in page) {
          return json({ error: page.error }, 400)
        }
        if (await pagePathTaken(db, page.path, id)) {
          return json({ error: 'That path is already used.' }, 400)
        }
        await updatePage(db, id, page)
        return json({ page: await getPageById(db, id) })
      }
      if (request.method === 'DELETE') {
        return (await trashRecord(db, 'pages', id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
      }
    }

    return json({ error: 'Not found' }, 404)
  })
}
